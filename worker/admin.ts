// The admin console's numbers about the site as a whole (src/routes/manage/stats-page.tsx):
//   adminOverview()  headline totals, the last 7 days, and a 14-day daily series
//   adminUsers()     players with what they have played, searchable
//   adminOrders()    PayOS orders, newest first
// Seeded leaderboard players (ids starting with `seed-`, scripts/seed-leaderboard.mjs) are left out
// everywhere, so the numbers are real people only. Days are Vietnam days (UTC+7).
import { toInt } from './sql.ts'

const REAL = (column: string) => `coalesce(${column}, '') not like 'seed-%'`
const DAYS = 14

const isoDaysAgo = (days: number) => new Date(Date.now() - days * 864e5).toISOString()

export async function adminOverview(db: D1Database) {
  const since = isoDaysAgo(7)
  const [totals, daily] = await db.batch([
    db.prepare(`with real as (select * from profiles where ${REAL('id')}),
        active as (select user_id from attempts where completed_at >= ?1 union select user_id from endless_sessions where updated_at >= ?1)
      select
        (select count(*) from real) as players,
        (select count(*) from real where is_guest = 0) as accounts,
        (select count(*) from real where created_at >= ?1) as new_7d,
        (select count(*) from active a join real r on r.id = a.user_id) as active_7d,
        (select count(*) from attempts where ${REAL('user_id')}) as attempts,
        (select count(*) from attempts where ${REAL('user_id')} and completed_at >= ?1) as attempts_7d,
        (select coalesce(sum(answered), 0) from endless_sessions where ${REAL('user_id')}) as endless_answers,
        (select coalesce(sum(answered), 0) from endless_sessions where ${REAL('user_id')} and started_at >= ?1) as endless_answers_7d,
        (select count(*) from real where ad_free_at is not null) as ad_free,
        (select count(*) from payment_orders where status = 'paid') as orders_paid,
        (select count(*) from payment_orders where status = 'pending') as orders_pending,
        (select coalesce(sum(amount_vnd), 0) from payment_orders where status = 'paid') as revenue_vnd,
        (select coalesce(sum(amount_vnd), 0) from payment_orders where status = 'paid' and paid_at >= ?1) as revenue_7d_vnd`)
      .bind(since),
    // one row per day, oldest first; "active" is anyone who finished a quiz or an Endless answer that day
    db.prepare(`with recursive days(d) as (
          select date('now', '+7 hours', '-${DAYS - 1} days')
          union all select date(d, '+1 day') from days where d < date('now', '+7 hours')
        )
      select d as day,
        (select count(*) from profiles where ${REAL('id')} and date(created_at, '+7 hours') = d) as new_players,
        (select count(*) from (
          select user_id from attempts where ${REAL('user_id')} and date(completed_at, '+7 hours') = d
          union select user_id from endless_sessions where ${REAL('user_id')} and date(updated_at, '+7 hours') = d)) as active_players,
        (select count(*) from attempts where ${REAL('user_id')} and date(completed_at, '+7 hours') = d) as attempts,
        (select coalesce(sum(answered), 0) from endless_sessions where ${REAL('user_id')} and date(started_at, '+7 hours') = d) as endless_answers
      from days order by d`),
  ])
  return { totals: totals!.results[0], daily: daily!.results }
}

const USER_SORTS = {
  recent: 'last_active is null, last_active desc, p.created_at desc',
  most: '(attempts + endless_answers) desc, last_active desc',
  new: 'p.created_at desc',
} as const

// ?search= matches the name, username or email; ?sort=recent|most|new
export async function adminUsers(db: D1Database, q: { search?: string; sort?: string; limit?: string }) {
  const search = (q.search ?? '').trim().slice(0, 80)
  const order = USER_SORTS[(q.sort ?? 'recent') as keyof typeof USER_SORTS] ?? USER_SORTS.recent
  const limit = Math.min(Math.max(toInt(q.limit, 50), 1), 200)
  const { results } = await db
    .prepare(`select * from (
        select p.id, p.username, p.display_name, p.avatar_emoji, p.role, p.is_guest, p.created_at, p.ad_free_at,
          -- a guest's address is a placeholder, not one to show
          case when coalesce(u.isAnonymous, 0) = 1 then null else u.email end as email,
          coalesce(a.n, 0) as attempts, coalesce(e.runs, 0) as endless_runs, coalesce(e.answered, 0) as endless_answers,
          nullif(max(coalesce(a.last, ''), coalesce(e.last, '')), '') as last_active
        from profiles p
        left join user u on u.id = p.id
        left join (select user_id, count(*) as n, max(completed_at) as last from attempts group by user_id) a on a.user_id = p.id
        left join (select user_id, count(*) as runs, sum(answered) as answered, max(updated_at) as last from endless_sessions group by user_id) e
          on e.user_id = p.id
        where ${REAL('p.id')} and (?1 = '' or p.display_name like ?2 or p.username like ?2 or u.email like ?2)
      ) p order by ${order} limit ?3`)
    .bind(search, `%${search}%`, limit)
    .all()
  return results.map((row) => ({ ...row, is_guest: Boolean(row.is_guest) }))
}

// ?status=pending|paid|cancelled|expired|failed (all when missing)
export async function adminOrders(db: D1Database, q: { status?: string; limit?: string }) {
  const status = q.status ?? ''
  const limit = Math.min(Math.max(toInt(q.limit, 50), 1), 200)
  const { results } = await db
    .prepare(`select o.order_code, o.product_id, coalesce(sp.name, o.product_id) as product_name, o.amount_vnd, o.status, o.provider,
        o.created_at, o.paid_at, o.user_id, p.display_name, p.username, p.avatar_emoji, u.email
      from payment_orders o
      left join profiles p on p.id = o.user_id
      left join user u on u.id = o.user_id
      left join store_products sp on sp.id = o.product_id
      where ?1 = '' or o.status = ?1
      order by o.created_at desc limit ?2`)
    .bind(status, limit)
    .all()
  return results
}
