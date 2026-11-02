// What anyone can read: topics and profiles, plus the shared bits of a quiz's card the admin console
// uses. Questions and options never come out of here: Endless (endless.ts) sends them without their key.
import { bools } from './sql.ts'

// the Endless pool: published and public
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

// ---------------------------------------------------------------- profiles

// Everything a profile shows publicly. ai_credits only goes to its owner (/api/me).
const PROFILE_COLUMNS = 'id, username, display_name, avatar_emoji, role, is_guest, organization, bio, created_at, updated_at'

export async function profileByUsername(db: D1Database, username: string) {
  const row = await db.prepare(`select ${PROFILE_COLUMNS} from profiles where username = ?`).bind(username).first()
  return row ? bools(row, 'is_guest') : null
}

export async function ownProfile(db: D1Database, userId: string) {
  // ad_free: bought the ad-free pass, or an admin (who never sees ads)
  const row = await db
    .prepare(`select ${PROFILE_COLUMNS}, ai_credits, (ad_free_at is not null or role = 'admin') as ad_free from profiles where id = ?`)
    .bind(userId)
    .first()
  return row ? bools(row, 'is_guest', 'ad_free') : null
}
