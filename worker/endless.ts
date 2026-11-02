// Endless mode: a never-ending stream of questions from every published public quiz.
//   · a question's "area" is its quiz's topic, so there is no per-question tagging to keep up
//   · a batch leans toward the player's stronger topics, and the weakest gets a guaranteed slot,
//     so the stream keeps teaching instead of just flattering
//   · each answer is graded here, one at a time; the key for that one question
//     is revealed only after it has been answered
//   · every kind is drawn (worker/grading.ts says what each means); what reaches the browser before
//     the answer is the same as a quiz's play payload: a true/false question's statements without
//     their truth, a short-answer question with no options at all (they ARE its key)
//   · a run (endless_sessions) keeps the streak the Endless leaderboard ranks by, and
//     endless_progress the per-topic counts the topic boards and /progress read
import type { Member } from './env.ts'
import { LISTED } from './catalog.ts'
import { grade, type Given } from './grading.ts'
import { AppError, NOW, uuid } from './sql.ts'

interface ProgressRow {
  topic_id: string
  slug: string
  name: string
  emoji: string
  accent: string
  answered: number
  correct: number
}

const withAccuracy = (p: ProgressRow) => ({
  ...p,
  accuracy: p.answered > 0 ? Math.round((p.correct / p.answered) * 1000) / 10 : 0,
})

// The player's progress per topic, best first.
export async function progressOf(db: D1Database, userId: string | null) {
  if (!userId) return []
  const { results } = await db
    .prepare(`select t.id as topic_id, t.slug, t.name, t.emoji, t.accent, p.answered, p.correct
      from endless_progress p join topics t on t.id = p.topic_id where p.user_id = ?`)
    .bind(userId)
    .all<ProgressRow>()
  const ratio = (p: ProgressRow) => (p.answered > 0 ? p.correct / p.answered : 0)
  return results.sort((a, b) => ratio(b) - ratio(a) || a.name.localeCompare(b.name)).map(withAccuracy)
}

export async function startSession(db: D1Database, member: Member, topicId: string | null) {
  const id = uuid()
  await db.prepare('insert into endless_sessions (id, user_id, topic_id) values (?, ?, ?)').bind(id, member.id, topicId).run()
  return id
}

// Up to `limit` questions not in `exclude` (already seen this run), weighted by the player's
// mastery of each topic, plus their progress. topicId scopes the pool to one subject.
export async function nextBatch(db: D1Database, userId: string | null, limit: number, exclude: string[], topicId: string | null) {
  const size = Math.min(Math.max(limit, 1), 30)
  const [candidates, progress] = await Promise.all([
    db
      .prepare(`select qu.id, q.topic_id from questions qu join quizzes q on q.id = qu.quiz_id
        where ${LISTED} and (?1 is null or q.topic_id = ?1)
          and qu.id not in (select value from json_each(?2))
          and exists (select 1 from options o where o.question_id = qu.id)`)
      .bind(topicId, JSON.stringify(exclude.slice(0, 2000)))
      .all<{ id: string; topic_id: string | null }>(),
    progressOf(db, userId),
  ])

  const mastery = new Map(progress.map((p) => [p.topic_id, p]))
  // 0.6 (weak) … 1.5 (strong); an untouched topic sits at 0.75, a little above a weak one, so
  // exploring new ground beats grinding a topic the player keeps getting wrong
  const weightOf = (topic: string | null) => {
    const p = topic ? mastery.get(topic) : undefined
    return !p || p.answered === 0 ? 0.75 : 0.6 + 0.9 * (p.correct / p.answered)
  }
  const isWeak = (topic: string | null) => {
    const p = topic ? mastery.get(topic) : undefined
    return Boolean(p && p.answered > 0 && p.correct / p.answered < 0.5)
  }

  const pool = candidates.results
  const picked = new Set<string>()
  // one guaranteed question from a weak topic…
  const weak = pool.filter((c) => isWeak(c.topic_id))
  if (weak.length) picked.add(weak[Math.floor(Math.random() * weak.length)]!.id)
  // …then weighted sampling without replacement (Efraimidis–Spirakis: keep the largest u^(1/w))
  const keyed = pool.map((c) => ({ id: c.id, key: Math.random() ** (1 / weightOf(c.topic_id)) })).sort((a, b) => b.key - a.key)
  for (const c of keyed) {
    if (picked.size >= size) break
    picked.add(c.id)
  }

  const ids = JSON.stringify([...picked])
  const [questions, options] = await db.batch([
    db.prepare(`select qu.id, qu.kind, qu.prompt, qu.image_url, qu.points, q.id as quiz_id, q.slug as quiz_slug, q.title as quiz_title,
        q.cover_emoji, t.id as topic_id, t.slug as topic_slug, t.name as topic_name, t.emoji as topic_emoji, t.accent as topic_accent
      from questions qu join quizzes q on q.id = qu.quiz_id left join topics t on t.id = q.topic_id
      where qu.id in (select value from json_each(?1))`).bind(ids),
    db.prepare(`select id, question_id, position, label from options where question_id in (select value from json_each(?1)) order by position`).bind(ids),
  ])
  const optionsOf = new Map<string, { id: string; position: number; label: string }[]>()
  for (const o of options!.results as { id: string; question_id: string; position: number; label: string }[]) {
    optionsOf.set(o.question_id, [...(optionsOf.get(o.question_id) ?? []), { id: o.id, position: o.position, label: o.label }])
  }

  type Row = Record<string, string | number | null>
  const out = (questions!.results as Row[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    prompt: r.prompt,
    image_url: r.image_url,
    points: r.points,
    quiz: { id: r.quiz_id, slug: r.quiz_slug, title: r.quiz_title, cover_emoji: r.cover_emoji },
    topic: r.topic_id ? { id: r.topic_id, slug: r.topic_slug, name: r.topic_name, emoji: r.topic_emoji, accent: r.topic_accent } : null,
    // a short answer's options are its accepted answers, so none of them leave before it is answered
    options: r.kind === 'short_answer' ? [] : (optionsOf.get(String(r.id)) ?? []),
  }))
  // shuffled, so the guaranteed weak question isn't always first
  out.sort(() => Math.random() - 0.5)
  return { questions: out, progress }
}

// `given` is read the way the question's kind needs it: option_id, marks or text (worker/grading.ts).
export async function gradeAnswer(db: D1Database, member: Member, questionId: string, given: Given, sessionId: string | null) {
  const question = await db
    .prepare(`select qu.id, qu.kind, qu.explanation, q.topic_id from questions qu join quizzes q on q.id = qu.quiz_id where qu.id = ?`)
    .bind(questionId)
    .first<{ id: string; kind: string; explanation: string | null; topic_id: string | null }>()
  if (!question) throw new AppError('Không tìm thấy câu hỏi này.', 404)
  // only questions in the public pool can be graded, so a crafted request can't probe a draft's key
  const listed = await db.prepare(`select 1 from quizzes q join questions qu on qu.quiz_id = q.id where qu.id = ? and ${LISTED}`).bind(questionId).first()
  if (!listed) throw new AppError('Câu hỏi này không còn trong kho luyện tập.', 404)

  const rows = await db
    .prepare('select id, label, is_correct from options where question_id = ? order by position')
    .bind(question.id)
    .all<{ id: string; label: string; is_correct: number }>()
  const key = rows.results.map((o) => ({ id: o.id, label: o.label, is_correct: Boolean(o.is_correct) }))
  const graded = grade(question.kind, key, given)
  const right = graded.is_correct ? 1 : 0

  const statements: D1PreparedStatement[] = []
  if (sessionId) {
    // the streak in one statement: SET reads the row as it was, so two answers can't share a start
    statements.push(
      db.prepare(`update endless_sessions set answered = answered + 1, correct = correct + ?3,
          current_streak = case when ?3 = 1 then current_streak + 1 else 0 end,
          best_streak = max(best_streak, case when ?3 = 1 then current_streak + 1 else 0 end), updated_at = ${NOW}
        where id = ?1 and user_id = ?2`).bind(sessionId, member.id, right),
    )
  }
  let topic = null
  let progress = null
  if (question.topic_id) {
    statements.push(
      db.prepare(`insert into endless_progress (user_id, topic_id, answered, correct) values (?1, ?2, 1, ?3)
          on conflict (user_id, topic_id) do update set answered = answered + 1, correct = correct + ?3, updated_at = ${NOW}`)
        .bind(member.id, question.topic_id, right),
      db.prepare(`select t.id as topic_id, t.slug, t.name, t.emoji, t.accent, p.answered, p.correct
          from endless_progress p join topics t on t.id = p.topic_id where p.user_id = ? and p.topic_id = ?`).bind(member.id, question.topic_id),
    )
  }
  if (statements.length) {
    const res = await db.batch(statements)
    const row = question.topic_id ? (res[res.length - 1]!.results[0] as ProgressRow | undefined) : undefined
    if (row) {
      progress = withAccuracy(row)
      topic = { id: row.topic_id, slug: row.slug, name: row.name, emoji: row.emoji, accent: row.accent }
    }
  }

  return {
    question_id: question.id,
    kind: question.kind,
    is_correct: graded.is_correct,
    // what the player gave, as graded
    option_id: graded.option_id,
    marks: graded.marks,
    text: graded.text,
    correct_option_id: question.kind === 'single' ? (key.find((o) => o.is_correct)?.id ?? null) : null,
    // the key, now that it has been answered: each statement's truth, or the accepted answers
    key: question.kind === 'single' ? null : key,
    explanation: question.explanation,
    topic,
    progress,
  }
}

// One row per player, ranked by their best run's streak. Aggregates only, never a raw run.
export async function endlessLeaderboard(db: D1Database, limit: number) {
  const { results } = await db
    .prepare(`select s.user_id, p.username, coalesce(nullif(p.display_name, ''), 'Người chơi ẩn danh') as display_name,
        coalesce(p.avatar_emoji, '🎓') as avatar_emoji, coalesce(p.is_guest, 0) as is_guest,
        max(s.best_streak) as best_streak, max(s.correct) as best_correct, count(*) as session_count, max(s.updated_at) as last_played_at
      from endless_sessions s left join profiles p on p.id = s.user_id
      group by s.user_id having max(s.best_streak) > 0
      order by best_streak desc, best_correct desc, last_played_at asc limit ?`)
    .bind(Math.min(Math.max(limit, 1), 200))
    .all<Record<string, unknown>>()
  return results.map((r) => ({ ...r, is_guest: Boolean(r.is_guest) }))
}

// Players ranked by correct Endless answers in one topic (its slug), or summed across every topic when
// there is none; accuracy breaks ties, then whoever got there first.
export async function topicLeaderboard(db: D1Database, topicSlug: string | null, limit: number) {
  const { results } = await db
    .prepare(`select e.user_id, p.username, coalesce(nullif(p.display_name, ''), 'Người chơi ẩn danh') as display_name,
        coalesce(p.avatar_emoji, '🎓') as avatar_emoji, coalesce(p.is_guest, 0) as is_guest,
        sum(e.correct) as correct, sum(e.answered) as answered, max(e.updated_at) as last_played_at
      from endless_progress e left join profiles p on p.id = e.user_id
      where ?1 is null or e.topic_id = (select id from topics where slug = ?1)
      group by e.user_id having sum(e.correct) > 0
      order by correct desc, cast(sum(e.correct) as real) / sum(e.answered) desc, last_played_at asc limit ?2`)
    .bind(topicSlug, Math.min(Math.max(limit, 1), 200))
    .all<Record<string, unknown>>()
  return results.map((r) => ({
    ...r,
    is_guest: Boolean(r.is_guest),
    accuracy: Number(r.answered) > 0 ? Math.round((Number(r.correct) / Number(r.answered)) * 1000) / 10 : 0,
  }))
}

// A player's Endless record, for /progress (their own) and their public profile: totals over every run,
// and every topic they have answered in.
export async function endlessStats(db: D1Database, userId: string) {
  const [runs, topics] = await Promise.all([
    db
      .prepare(`select count(*) as runs, coalesce(max(best_streak), 0) as best_streak, max(updated_at) as last_played_at
        from endless_sessions where user_id = ? and answered > 0`)
      .bind(userId)
      .first<{ runs: number; best_streak: number; last_played_at: string | null }>(),
    progressOf(db, userId),
  ])
  const answered = topics.reduce((sum, t) => sum + t.answered, 0)
  const correct = topics.reduce((sum, t) => sum + t.correct, 0)
  return {
    runs: runs?.runs ?? 0,
    best_streak: runs?.best_streak ?? 0,
    last_played_at: runs?.last_played_at ?? null,
    answered,
    correct,
    accuracy: answered > 0 ? Math.round((correct / answered) * 1000) / 10 : 0,
    topics,
  }
}
