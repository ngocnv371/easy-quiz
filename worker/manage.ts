// The admin console: an admin's own quizzes, the editor's one-shot save, status changes, deletes
// and the per-quiz report. Every query is scoped to the owner.
import type { Member } from './env.ts'
import { CARD_SELECT, card } from './catalog.ts'
import { KINDS } from './grading.ts'
import { questionsOf } from './play.ts'
import { AppError, NOW, bools, jsonRows, nowIso, oneOf, slugSuffix, slugify, toInt, trimTo, uuid } from './sql.ts'

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export const VISIBILITIES = ['private', 'unlisted', 'public'] as const
export const STATUSES = ['draft', 'published', 'archived'] as const

interface DraftOption {
  label?: unknown
  is_correct?: unknown
}
interface DraftQuestion {
  kind?: unknown
  prompt?: unknown
  explanation?: unknown
  points?: unknown
  time_limit_seconds?: unknown
  image_url?: unknown
  options?: DraftOption[]
}

const truthy = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1'

// What a question needs before it can be published, per kind (worker/grading.ts says what options
// mean); null when it is fine.
function publishProblem(q: DraftQuestion): string | null {
  const options = Array.isArray(q.options) ? q.options : []
  const filled = options.filter((o) => trimTo(o?.label, 240))
  if (!trimTo(q.prompt, 600)) return 'Mỗi câu hỏi cần có nội dung.'
  const kind = oneOf(KINDS, q.kind, 'single')
  if (kind === 'true_false') {
    return filled.length === 0 || filled.length !== options.length ? 'Câu Đúng/Sai cần ít nhất 1 mệnh đề và mệnh đề nào cũng có nội dung.' : null
  }
  if (kind === 'short_answer') return filled.length === 0 ? 'Câu trả lời ngắn cần ít nhất 1 đáp án được chấp nhận.' : null
  return options.length < 2 || options.filter((o) => truthy(o?.is_correct)).length !== 1 ? 'Mỗi câu trắc nghiệm cần ít nhất 2 lựa chọn và đúng 1 đáp án.' : null
}

// The statements that replace a quiz's questions wholesale (options go with them by cascade).
// For a single-choice question only the first option marked correct counts, and one with none gets
// its first option, so a quiz is always gradable. A true/false statement keeps its own truth; every
// short answer is accepted, and blank ones are dropped (a placeholder would be an accepted answer).
export function replaceQuestions(db: D1Database, quizId: string, questions: DraftQuestion[]) {
  const qs: unknown[] = []
  const os: unknown[] = []
  questions.forEach((q, i) => {
    const id = uuid()
    const timeLimit = q.time_limit_seconds === null || q.time_limit_seconds === undefined || q.time_limit_seconds === '' ? null : Math.max(toInt(q.time_limit_seconds, 0), 0)
    const kind = oneOf(KINDS, q.kind, 'single')
    qs.push({
      id,
      position: i + 1,
      kind,
      prompt: trimTo(q.prompt, 600) ?? `Câu hỏi ${i + 1}`,
      explanation: trimTo(q.explanation, 600),
      points: Math.max(toInt(q.points, 1), 0),
      time_limit_seconds: timeLimit,
      image_url: trimTo(q.image_url, 1000),
    })
    let options = Array.isArray(q.options) ? q.options : []
    if (kind === 'short_answer') options = options.filter((o) => trimTo(o?.label, 240))
    let keyAt = options.findIndex((o) => truthy(o?.is_correct))
    if (keyAt < 0) keyAt = 0
    options.forEach((o, j) => {
      const isCorrect = kind === 'single' ? j === keyAt : kind === 'short_answer' || truthy(o?.is_correct)
      os.push({ id: uuid(), question_id: id, position: j + 1, label: trimTo(o?.label, 240) ?? `Lựa chọn ${j + 1}`, is_correct: isCorrect ? 1 : 0 })
    })
  })
  return [
    db.prepare('delete from questions where quiz_id = ?').bind(quizId),
    db.prepare(`insert into questions (id, quiz_id, position, kind, prompt, explanation, points, time_limit_seconds, image_url)
        select value ->> 'id', ?1, value ->> 'position', value ->> 'kind', value ->> 'prompt', value ->> 'explanation', value ->> 'points',
          value ->> 'time_limit_seconds', value ->> 'image_url' from json_each(?2)`).bind(quizId, jsonRows(qs)),
    db.prepare(`insert into options (id, question_id, position, label, is_correct)
        select value ->> 'id', value ->> 'question_id', value ->> 'position', value ->> 'label', value ->> 'is_correct' from json_each(?1)`).bind(jsonRows(os)),
  ]
}

// A slug nobody else has: `wanted`, or `wanted-xxxxx` when it is taken.
export async function freeSlug(db: D1Database, wanted: string, fallback: string, quizId: string | null) {
  const slug = (slugify(wanted) || fallback).slice(0, 48)
  const taken = await db.prepare('select 1 from quizzes where slug = ? and id <> ?').bind(slug, quizId ?? '').first()
  return taken ? `${slug}-${slugSuffix()}` : slug
}

export async function myQuizzes(db: D1Database, ownerId: string) {
  const { results } = await db.prepare(`${CARD_SELECT} where q.owner_id = ? order by q.updated_at desc`).bind(ownerId).all()
  return results.map(card)
}

// The editor's document: the quiz row, its card and its questions with options (key included —
// it's the owner's own quiz).
export async function quizForEdit(db: D1Database, ownerId: string, quizId: string) {
  const quiz = await db.prepare('select * from quizzes where id = ? and owner_id = ?').bind(quizId, ownerId).first()
  if (!quiz) return null
  const [cardRow, questions] = await Promise.all([db.prepare(`${CARD_SELECT} where q.id = ?`).bind(quizId).first(), questionsOf(db, quizId)])
  return {
    quiz: bools(quiz, 'shuffle_questions', 'shuffle_options', 'ai_generated'),
    card: card(cardRow!),
    questions,
  }
}

interface SavePayload extends Record<string, unknown> {
  questions?: DraftQuestion[]
}

// One write for the whole editor document. Publishing is where quality is enforced: at least one
// question, each with a prompt and a complete key for its kind (publishProblem).
export async function saveQuiz(db: D1Database, member: Member, p: SavePayload) {
  const existingId = trimTo(p.id, 64)
  const existing = existingId
    ? await db.prepare('select id, status, published_at from quizzes where id = ? and owner_id = ?').bind(existingId, member.id).first<{ id: string; status: string; published_at: string | null }>()
    : null
  if (existingId && !existing) throw new AppError('Không tìm thấy đề thi hoặc bạn không phải chủ sở hữu.', 403)

  const status = oneOf(STATUSES, p.status, 'draft')
  const questions = Array.isArray(p.questions) ? p.questions : []
  if (status === 'published') {
    if (questions.length === 0) throw new AppError('Cần ít nhất một câu hỏi trước khi xuất bản.')
    for (const [i, q] of questions.entries()) {
      const problem = publishProblem(q)
      if (problem) throw new AppError(`Câu ${i + 1}: ${problem}`)
    }
  }

  const id = existing?.id ?? uuid()
  const title = trimTo(p.title, 120) ?? 'Đề thi chưa đặt tên'
  const slug = await freeSlug(db, trimTo(p.slug, 120) ?? title, 'de-thi', id)
  // published_at marks when the quiz crossed into published, and goes when it leaves
  const publishedAt = status !== 'published' ? null : existing?.status === 'published' ? (existing.published_at ?? nowIso()) : nowIso()
  const fields = {
    topic_id: trimTo(p.topic_id, 64),
    slug,
    title,
    description: trimTo(p.description, 600),
    cover_emoji: trimTo(p.cover_emoji, 16) ?? '📝',
    difficulty: oneOf(DIFFICULTIES, p.difficulty, 'medium'),
    visibility: oneOf(VISIBILITIES, p.visibility, 'private'),
    status,
    time_limit_seconds: Math.max(toInt(p.time_limit_seconds, 0), 0),
    shuffle_questions: p.shuffle_questions === undefined ? 1 : truthy(p.shuffle_questions) ? 1 : 0,
    shuffle_options: p.shuffle_options === undefined ? 1 : truthy(p.shuffle_options) ? 1 : 0,
    published_at: publishedAt,
  }

  const write = existing
    ? db.prepare(`update quizzes set topic_id = ?2, slug = ?3, title = ?4, description = ?5, cover_emoji = ?6, difficulty = ?7,
          visibility = ?8, status = ?9, time_limit_seconds = ?10, shuffle_questions = ?11, shuffle_options = ?12, published_at = ?13,
          updated_at = ${NOW} where id = ?1`)
    : // ai_generated is set once, on creation: editing later must not rewrite where a quiz came from
      db.prepare(`insert into quizzes (id, topic_id, slug, title, description, cover_emoji, difficulty, visibility, status,
          time_limit_seconds, shuffle_questions, shuffle_options, published_at, owner_id, ai_generated)
          values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`)
  const values = [id, ...Object.values(fields)]
  await db.batch([
    existing ? write.bind(...values) : write.bind(...values, member.id, truthy(p.ai_generated) ? 1 : 0),
    ...replaceQuestions(db, id, questions),
  ])
  return { id, slug, status, question_count: questions.length }
}

export async function updateQuizStatus(db: D1Database, ownerId: string, quizId: string, patch: { status?: unknown; visibility?: unknown }) {
  const quiz = await db.prepare('select status, visibility, published_at from quizzes where id = ? and owner_id = ?').bind(quizId, ownerId)
    .first<{ status: string; visibility: string; published_at: string | null }>()
  if (!quiz) throw new AppError('Không tìm thấy đề thi.', 404)
  const status = oneOf(STATUSES, patch.status, quiz.status as (typeof STATUSES)[number])
  const visibility = oneOf(VISIBILITIES, patch.visibility, quiz.visibility as (typeof VISIBILITIES)[number])
  const publishedAt = status !== 'published' ? null : quiz.status === 'published' ? quiz.published_at : nowIso()
  await db.prepare(`update quizzes set status = ?, visibility = ?, published_at = ?, updated_at = ${NOW} where id = ? and owner_id = ?`)
    .bind(status, visibility, publishedAt, quizId, ownerId).run()
}

export async function deleteQuiz(db: D1Database, ownerId: string, quizId: string) {
  await db.prepare('delete from quizzes where id = ? and owner_id = ?').bind(quizId, ownerId).run()
}

// What the performance report is built from (buildQuizReport in src/features/manage/report.ts):
// the quiz's attempts, questions, answers and the players' profiles.
export async function quizReport(db: D1Database, ownerId: string, quizId: string) {
  const cardRow = await db.prepare(`${CARD_SELECT} where q.id = ? and q.owner_id = ?`).bind(quizId, ownerId).first()
  if (!cardRow) return null
  const [attempts, questions, answers, profiles] = await db.batch([
    db.prepare('select * from attempts where quiz_id = ?').bind(quizId),
    db.prepare('select * from questions where quiz_id = ? order by position').bind(quizId),
    db.prepare('select aa.* from attempt_answers aa join attempts a on a.id = aa.attempt_id where a.quiz_id = ?').bind(quizId),
    db.prepare(`select id, username, display_name, avatar_emoji, role, is_guest, organization, bio, created_at, updated_at
        from profiles where id in (select user_id from attempts where quiz_id = ?)`).bind(quizId),
  ])
  return {
    card: card(cardRow),
    attempts: attempts!.results,
    questions: questions!.results,
    answers: answers!.results.map((a) => bools(a as Record<string, unknown>, 'is_correct')),
    profiles: profiles!.results.map((p) => bools(p as Record<string, unknown>, 'is_guest')),
  }
}
