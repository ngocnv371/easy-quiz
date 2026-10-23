// Playing a quiz, exam-style. The answer key never reaches the browser:
//   playPayload()   the quiz and its questions WITHOUT is_correct
//   startQuiz()     charges the quiz's question count in energy, returns a one-time ticket
//   submitAttempt() redeems the ticket, grades on the server, stores the attempt, returns the review
// Attempts are only ever written here, which is what keeps a posted score trustworthy.
import type { Member } from './env.ts'
import { spendEnergy } from './energy.ts'
import { PLAYABLE } from './catalog.ts'
import { AppError, NOW, bools, jsonRows, nowIso, toInt, uuid } from './sql.ts'

interface QuizRow {
  id: string
  slug: string
  title: string
  description: string | null
  cover_emoji: string
  difficulty: string
  time_limit_seconds: number
  shuffle_questions: number
  shuffle_options: number
  play_count: number
  topic_id: string | null
}

const playableQuiz = (db: D1Database, slug: string) =>
  db.prepare(`select q.* from quizzes q where q.slug = ? and ${PLAYABLE}`).bind(slug).first<QuizRow>()

interface QuestionWithOptions {
  id: string
  position: number
  prompt: string
  explanation: string | null
  points: number
  time_limit_seconds: number | null
  image_url: string | null
  options: { id: string; position: number; label: string; is_correct: boolean }[]
}

// A quiz's questions with their options (key included: callers decide what leaves the Worker).
export async function questionsOf(db: D1Database, quizId: string): Promise<QuestionWithOptions[]> {
  const [questions, options] = await db.batch([
    db.prepare('select id, position, prompt, explanation, points, time_limit_seconds, image_url from questions where quiz_id = ? order by position').bind(quizId),
    db.prepare(`select o.id, o.question_id, o.position, o.label, o.is_correct from options o
        join questions qu on qu.id = o.question_id where qu.quiz_id = ? order by o.position`).bind(quizId),
  ])
  const byQuestion = new Map<string, QuestionWithOptions['options']>()
  for (const o of options!.results as { id: string; question_id: string; position: number; label: string; is_correct: number }[]) {
    const list = byQuestion.get(o.question_id) ?? []
    list.push({ id: o.id, position: o.position, label: o.label, is_correct: Boolean(o.is_correct) })
    byQuestion.set(o.question_id, list)
  }
  return (questions!.results as Omit<QuestionWithOptions, 'options'>[]).map((q) => ({ ...q, options: byQuestion.get(q.id) ?? [] }))
}

// The playable quiz (PlayPayload in src/lib/domain.ts), or null when it isn't playable.
export async function playPayload(db: D1Database, slug: string) {
  const quiz = await playableQuiz(db, slug)
  if (!quiz) return null
  const [topic, author, questions] = await Promise.all([
    quiz.topic_id ? db.prepare('select slug, name, emoji, accent from topics where id = ?').bind(quiz.topic_id).first() : null,
    db.prepare('select p.username, p.display_name, p.avatar_emoji from profiles p join quizzes q on q.owner_id = p.id where q.id = ?').bind(quiz.id).first(),
    questionsOf(db, quiz.id),
  ])
  return {
    quiz: {
      ...bools(
        {
          id: quiz.id, slug: quiz.slug, title: quiz.title, description: quiz.description, cover_emoji: quiz.cover_emoji,
          difficulty: quiz.difficulty, time_limit_seconds: quiz.time_limit_seconds, shuffle_questions: quiz.shuffle_questions,
          shuffle_options: quiz.shuffle_options, play_count: quiz.play_count,
        },
        'shuffle_questions',
        'shuffle_options',
      ),
      topic: topic ?? null,
      author: author ?? null,
    },
    questions: questions.map(({ explanation: _explanation, options, ...q }) => ({
      ...q,
      options: options.map(({ is_correct: _key, ...o }) => o),
    })),
  }
}

export async function startQuiz(db: D1Database, member: Member, slug: string) {
  const quiz = await playableQuiz(db, slug)
  if (!quiz) throw new AppError('Không tìm thấy đề thi này.', 404)
  const count = (await db.prepare('select count(*) as n from questions where quiz_id = ?').bind(quiz.id).first<number>('n')) ?? 0
  if (count === 0) throw new AppError('Đề thi chưa có câu hỏi nào.')

  const energy = await spendEnergy(db, member.id, count, 'quiz', quiz.id)
  const ticket = uuid()
  await db.prepare('insert into quiz_play_tickets (id, user_id, quiz_id, cost) values (?, ?, ?, ?)').bind(ticket, member.id, quiz.id, count).run()
  return { ticket_id: ticket, cost: count, energy }
}

interface SubmitInput {
  slug?: unknown
  answers?: unknown
  duration_seconds?: unknown
  guest_name?: unknown
  ticket_id?: unknown
}

export async function submitAttempt(db: D1Database, member: Member, input: SubmitInput) {
  const quiz = await playableQuiz(db, String(input.slug ?? ''))
  if (!quiz) throw new AppError('Không tìm thấy đề thi này.', 404)

  // Redeem the paid start: one guarded update, so a ticket backs exactly one attempt even if
  // submit is retried in parallel.
  const since = new Date(Date.now() - 864e5).toISOString()
  const redeemed = await db
    .prepare(`update quiz_play_tickets set used_at = ${NOW}
        where id = ? and user_id = ? and quiz_id = ? and used_at is null and created_at > ?`)
    .bind(String(input.ticket_id ?? ''), member.id, quiz.id, since)
    .run()
  if (!redeemed.meta.changes) throw new AppError('Lượt làm bài này không hợp lệ hoặc đã được nộp. Hãy bắt đầu lại đề thi.', 409)

  const questions = await questionsOf(db, quiz.id)
  if (questions.length === 0) throw new AppError('Đề thi chưa có câu hỏi nào.')

  // the first answer given for each question; unanswered questions are simply wrong
  const given = new Map<string, { option_id: string | null; time_ms: number }>()
  for (const a of Array.isArray(input.answers) ? input.answers : []) {
    const qid = String(a?.question_id ?? '')
    if (!qid || given.has(qid)) continue
    given.set(qid, { option_id: a?.option_id ? String(a.option_id) : null, time_ms: Math.max(toInt(a?.time_ms, 0), 0) })
  }

  const attemptId = uuid()
  let score = 0
  let correct = 0
  let maxScore = 0
  const answers = questions.map((q) => {
    maxScore += q.points
    const g = given.get(q.id)
    // the option must belong to this question, otherwise it can't be right
    const chosen = q.options.find((o) => o.id === g?.option_id)
    const isCorrect = Boolean(chosen?.is_correct)
    if (isCorrect) {
      score += q.points
      correct += 1
    }
    return { question_id: q.id, option_id: chosen?.id ?? null, is_correct: isCorrect ? 1 : 0, time_ms: g?.time_ms ?? 0 }
  })

  const attempt = {
    id: attemptId,
    quiz_id: quiz.id,
    user_id: member.id,
    guest_name: typeof input.guest_name === 'string' ? input.guest_name.trim().slice(0, 60) || null : null,
    score,
    max_score: maxScore,
    correct_count: correct,
    question_count: questions.length,
    accuracy: maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0,
    duration_seconds: Math.max(toInt(input.duration_seconds, 0), 0),
    completed_at: nowIso(),
  }

  await db.batch([
    db.prepare(`insert into attempts (id, quiz_id, user_id, guest_name, score, max_score, correct_count, question_count, accuracy, duration_seconds, completed_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(attempt.id, attempt.quiz_id, attempt.user_id, attempt.guest_name, score, maxScore, correct, questions.length, attempt.accuracy, attempt.duration_seconds, attempt.completed_at),
    db.prepare(`insert into attempt_answers (attempt_id, question_id, option_id, is_correct, time_ms)
        select ?1, value ->> 'question_id', value ->> 'option_id', value ->> 'is_correct', value ->> 'time_ms' from json_each(?2)`)
      .bind(attemptId, jsonRows(answers)),
    db.prepare('update quizzes set play_count = play_count + 1 where id = ?').bind(quiz.id),
  ])

  return {
    attempt,
    quiz: { id: quiz.id, slug: quiz.slug, title: quiz.title, cover_emoji: quiz.cover_emoji },
    review: questions.map((q, i) => ({
      question_id: q.id,
      position: q.position,
      prompt: q.prompt,
      explanation: q.explanation,
      points: q.points,
      is_correct: Boolean(answers[i]!.is_correct),
      chosen_option_id: answers[i]!.option_id,
      correct_option_id: q.options.find((o) => o.is_correct)?.id ?? null,
      options: q.options,
    })),
  }
}
