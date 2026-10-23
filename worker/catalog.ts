// The public catalogue and the read models built on it: topics, quiz cards, leaderboards, profiles
// and attempts. Who may see what (the old row-level security, in the queries now):
//   · a quiz is public when published and public/unlisted; its owner always sees it
//   · an attempt is visible to its player, to the quiz's owner, and to anyone when the quiz is public
//   · questions and options never come out of here: the play payload (play.ts) strips the key
import { bools } from './sql.ts'

export const PLAYABLE = "q.status = 'published' and q.visibility in ('public', 'unlisted')"
// the Explore list and Endless pool: published and listed
export const LISTED = "q.status = 'published' and q.visibility = 'public'"

export async function listTopics(db: D1Database) {
  const { results } = await db.prepare('select * from topics where is_active = 1 order by sort_order').all()
  return results.map((t) => bools(t, 'is_active'))
}

// Quiz rows with their topic, author and counts (QuizCard in src/lib/domain.ts).
export const CARD_SELECT = `select q.id, q.slug, q.title, q.description, q.cover_emoji, q.difficulty, q.visibility, q.status,
    q.time_limit_seconds, q.play_count, q.ai_generated, q.owner_id, q.topic_id, q.published_at, q.created_at, q.updated_at,
    t.slug as topic_slug, t.name as topic_name, t.emoji as topic_emoji, t.accent as topic_accent,
    p.username as author_username, p.display_name as author_name, p.avatar_emoji as author_avatar,
    (select count(*) from questions qu where qu.quiz_id = q.id) as question_count,
    (select coalesce(sum(qu.points), 0) from questions qu where qu.quiz_id = q.id) as max_score,
    (select count(*) from attempts a where a.quiz_id = q.id) as attempt_count
  from quizzes q left join topics t on t.id = q.topic_id left join profiles p on p.id = q.owner_id`

export const card = (row: Record<string, unknown>) => bools(row, 'ai_generated')

const like = (text: string) => `%${text.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`

export interface CardQuery {
  topic?: string
  topics?: string[]
  search?: string
  difficulty?: string
  sort?: string
  limit?: number
}

// The Explore list: published public quizzes, filtered and sorted.
export async function findQuizCards(db: D1Database, query: CardQuery) {
  const where = [LISTED]
  const args: unknown[] = []
  if (query.topic) {
    args.push(query.topic)
    where.push(`t.slug = ?${args.length}`)
  } else if (query.topics?.length) {
    args.push(JSON.stringify(query.topics))
    where.push(`t.slug in (select value from json_each(?${args.length}))`)
  }
  if (query.difficulty) {
    args.push(query.difficulty)
    where.push(`q.difficulty = ?${args.length}`)
  }
  const search = query.search?.trim()
  if (search) {
    args.push(like(search))
    const n = args.length
    where.push(`(lower(q.title) like ?${n} escape '\\' or lower(coalesce(q.description, '')) like ?${n} escape '\\' or lower(coalesce(t.name, '')) like ?${n} escape '\\')`)
  }
  const order =
    query.sort === 'popular' ? 'q.play_count desc' : query.sort === 'alphabetical' ? 'q.title collate nocase asc' : 'q.published_at desc'
  const limit = Math.min(Math.max(query.limit ?? 60, 1), 1000)
  const { results } = await db.prepare(`${CARD_SELECT} where ${where.join(' and ')} order by ${order}, q.id limit ${limit}`).bind(...args).all()
  return results.map(card)
}

// One quiz's card: anyone for a playable quiz, its owner always.
export async function quizCardBySlug(db: D1Database, slug: string, viewerId: string | null) {
  const row = await db.prepare(`${CARD_SELECT} where q.slug = ?1 and (${PLAYABLE} or q.owner_id = ?2)`).bind(slug, viewerId ?? '').first()
  return row ? card(row) : null
}

// ---------------------------------------------------------------- attempts as leaderboard rows

const ENTRY_SELECT = `select a.id as attempt_id, a.quiz_id, q.slug as quiz_slug, q.title as quiz_title, q.cover_emoji, q.topic_id,
    t.slug as topic_slug, t.name as topic_name, a.user_id,
    coalesce(nullif(p.display_name, ''), nullif(a.guest_name, ''), 'Người chơi ẩn danh') as display_name,
    p.username, coalesce(p.avatar_emoji, '🎓') as avatar_emoji, coalesce(p.is_guest, 0) as is_guest,
    a.score, a.max_score, a.correct_count, a.question_count, a.accuracy, a.duration_seconds, a.completed_at
  from attempts a join quizzes q on q.id = a.quiz_id left join topics t on t.id = q.topic_id left join profiles p on p.id = a.user_id`

// attempts `viewer` may see (see the top of this file)
const VISIBLE = `(${PLAYABLE} or a.user_id = ?1 or q.owner_id = ?1)`

const entry = (row: Record<string, unknown>) => bools(row, 'is_guest')

export async function quizLeaderboard(db: D1Database, quizId: string, viewerId: string | null, limit: number) {
  const { results } = await db
    .prepare(`${ENTRY_SELECT} where a.quiz_id = ?2 and ${VISIBLE} order by a.score desc, a.duration_seconds asc limit ?3`)
    .bind(viewerId ?? '', quizId, Math.min(Math.max(limit, 1), 200))
    .all()
  return results.map(entry)
}

// A player's attempts, newest first (their own history, or a public profile's).
export async function attemptsOf(db: D1Database, userId: string, viewerId: string | null, limit: number) {
  const { results } = await db
    .prepare(`${ENTRY_SELECT} where a.user_id = ?2 and ${VISIBLE} order by a.completed_at desc limit ?3`)
    .bind(viewerId ?? '', userId, Math.min(Math.max(limit, 1), 200))
    .all()
  return results.map(entry)
}

export async function attemptEntry(db: D1Database, attemptId: string, viewerId: string | null) {
  const row = await db.prepare(`${ENTRY_SELECT} where a.id = ?2 and ${VISIBLE}`).bind(viewerId ?? '', attemptId).first()
  return row ? entry(row) : null
}

// Recent attempts across the quizzes an admin owns.
export async function attemptsForOwner(db: D1Database, ownerId: string, limit: number) {
  const { results } = await db
    .prepare(`${ENTRY_SELECT} where q.owner_id = ?1 order by a.completed_at desc limit ?2`)
    .bind(ownerId, Math.min(Math.max(limit, 1), 200))
    .all()
  return results.map(entry)
}

// The player's best score on a quiz so far, for "phá kỷ lục" on the result screen.
export async function personalBest(db: D1Database, quizId: string, userId: string, exclude: string | null) {
  const best = await db
    .prepare('select max(score) as best from attempts where quiz_id = ? and user_id = ? and id <> ?')
    .bind(quizId, userId, exclude ?? '')
    .first<number>('best')
  return best ?? 0
}

// Lifetime totals per player (the "Bảng vàng" board), over public quizzes.
export async function globalLeaderboard(db: D1Database, limit: number) {
  const { results } = await db
    .prepare(`select a.user_id, coalesce(nullif(p.display_name, ''), 'Người chơi ẩn danh') as display_name, p.username,
        coalesce(p.avatar_emoji, '🎓') as avatar_emoji, coalesce(p.is_guest, 0) as is_guest,
        sum(a.score) as total_score, max(a.score) as best_score, count(*) as attempt_count,
        count(distinct a.quiz_id) as quiz_count, round(avg(a.accuracy), 2) as avg_accuracy, max(a.completed_at) as last_played_at
      from attempts a join quizzes q on q.id = a.quiz_id left join profiles p on p.id = a.user_id
      where a.user_id is not null and ${PLAYABLE}
      group by a.user_id order by total_score desc, avg_accuracy desc limit ?`)
    .bind(Math.min(Math.max(limit, 1), 200))
    .all()
  return results.map(entry)
}

// ---------------------------------------------------------------- profiles

// Everything a profile shows publicly. ai_credits only goes to its owner (/api/me).
const PROFILE_COLUMNS = 'id, username, display_name, avatar_emoji, role, is_guest, organization, bio, created_at, updated_at'

export async function profileByUsername(db: D1Database, username: string) {
  const row = await db.prepare(`select ${PROFILE_COLUMNS} from profiles where username = ?`).bind(username).first()
  return row ? bools(row, 'is_guest') : null
}

export async function ownProfile(db: D1Database, userId: string) {
  const row = await db.prepare(`select ${PROFILE_COLUMNS}, ai_credits from profiles where id = ?`).bind(userId).first()
  return row ? bools(row, 'is_guest') : null
}
