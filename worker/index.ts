// The Worker behind the site: the app comes from the assets (dist/client), and everything under
// /api/* lands here (run_worker_first in wrangler.jsonc). src/lib/api.ts is the page's side.
//
// Errors reply { error, code?, ... } with a fitting status; `error` is written for a person.
import { Hono, type Context } from 'hono'

import { adminOrders, adminOverview, adminUsers } from './admin.ts'
import { generateQuestions } from './ai.ts'
import { admins, authFor, memberOf, members, upgradeGuest } from './auth.ts'
import {
  attemptEntry, attemptsForOwner, attemptsOf, findQuizCards, globalLeaderboard, listTopics, ownProfile, personalBest,
  profileByUsername, quizCardBySlug, quizLeaderboard,
} from './catalog.ts'
import { endlessLeaderboard, gradeAnswer, nextBatch, startSession } from './endless.ts'
import type { AppEnv } from './env.ts'
import { track } from './events.ts'
import { importQuestions } from './import.ts'
import { deleteQuiz, myQuizzes, quizForEdit, quizReport, saveQuiz, updateQuizStatus } from './manage.ts'
import { checkout, listProducts, sync, webhook } from './payments.ts'
import { playPayload, startQuiz, submitAttempt } from './play.ts'
import { AppError, NOW, toInt, trimTo } from './sql.ts'

const app = new Hono<AppEnv>().basePath('/api')

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code, ...err.extra }, err.status as 400)
  }
  console.error(c.req.method, c.req.path, err)
  track(c.env, 'server_error', { detail: `${c.req.method} ${c.req.path}: ${err.message}` })
  return c.json({ error: 'Máy chủ gặp lỗi, hãy thử lại sau.' }, 500)
})

const body = async (c: Context<AppEnv>) => ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
const limitOf = (c: Context<AppEnv>, fallback: number) => toInt(c.req.query('limit'), fallback)
// the viewer, when signed in, for routes anyone may call
const viewerId = async (c: Context<AppEnv>) => (await memberOf(c))?.id ?? null

// sign up, sign in, guests, confirm email, session: all Better Auth
app.on(['GET', 'POST'], '/auth/*', (c) => authFor(c.env, c.executionCtx).handler(c.req.raw))

// Errors from the page, so browser-side failures show up next to the Worker's.
app.post('/log', async (c) => {
  const b = await body(c)
  const cut = (s: unknown, n: number) => String(s ?? '').slice(0, n)
  console.error('client error', { message: cut(b.message, 500), stack: cut(b.stack, 2000), url: cut(b.url, 300) })
  track(c.env, 'client_error', { detail: cut(b.message, 256) })
  return c.body(null, 204)
})

// ------------------------------------------------------------------ the signed-in member

// { user, profile } or { user: null } when signed out
app.get('/me', async (c) => {
  const session = await authFor(c.env, c.executionCtx).api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ user: null, profile: null })
  const member = await memberOf(c)
  const u = session.user as typeof session.user & { isAnonymous?: boolean | null }
  return c.json({
    user: { id: u.id, email: u.email, emailVerified: u.emailVerified, isAnonymous: Boolean(u.isAnonymous ?? member?.isAnonymous) },
    profile: await ownProfile(c.env.DB, u.id),
  })
})

app.use('/me/*', members)

// the profile fields a player may change; role and is_guest never come from the page
app.patch('/me/profile', async (c) => {
  const b = await body(c)
  const sets: string[] = []
  const args: unknown[] = []
  const set = (column: string, value: unknown) => {
    args.push(value)
    sets.push(`${column} = ?${args.length}`)
  }
  if ('username' in b) {
    const username = String(b.username ?? '').trim().toLowerCase()
    if (!/^[a-z0-9_]{3,32}$/.test(username)) throw new AppError('Tên người dùng gồm 3–32 chữ thường, số hoặc dấu gạch dưới.')
    const taken = await c.env.DB.prepare('select 1 from profiles where username = ? and id <> ?').bind(username, c.get('member').id).first()
    if (taken) throw new AppError('Tên người dùng này đã có người dùng.', 409)
    set('username', username)
  }
  if ('display_name' in b) {
    const name = trimTo(b.display_name, 60)
    if (!name) throw new AppError('Tên hiển thị không được để trống.')
    set('display_name', name)
  }
  if ('avatar_emoji' in b) set('avatar_emoji', trimTo(b.avatar_emoji, 16) ?? '🎓')
  if ('organization' in b) set('organization', trimTo(b.organization, 120))
  if ('bio' in b) {
    const bio = trimTo(b.bio, 1000)
    if (bio && bio.length > 280) throw new AppError('Giới thiệu tối đa 280 ký tự.')
    set('bio', bio)
  }
  if (sets.length) {
    args.push(c.get('member').id)
    await c.env.DB.prepare(`update profiles set ${sets.join(', ')}, updated_at = ${NOW} where id = ?${args.length}`).bind(...args).run()
  }
  return c.json(await ownProfile(c.env.DB, c.get('member').id))
})

// body: { email, password, displayName, organization? } -> { needsEmailConfirmation }
app.post('/me/upgrade', async (c) => c.json(await upgradeGuest(c, await body(c))))

// ------------------------------------------------------------------ catalogue (anyone)

app.get('/topics', async (c) => c.json(await listTopics(c.env.DB)))

// ?topic=&topics=a,b&search=&difficulty=&sort=new|popular|alphabetical&limit=
app.get('/quizzes', async (c) => {
  const q = c.req.query()
  return c.json(
    await findQuizCards(c.env.DB, {
      topic: q.topic || undefined,
      topics: q.topics ? q.topics.split(',').filter(Boolean) : undefined,
      search: q.search,
      difficulty: q.difficulty || undefined,
      sort: q.sort,
      limit: toInt(q.limit, 60),
    }),
  )
})

app.get('/quizzes/:slug', async (c) => {
  const quiz = await quizCardBySlug(c.env.DB, c.req.param('slug'), await viewerId(c))
  return quiz ? c.json(quiz) : c.json({ error: 'Không tìm thấy đề thi này.' }, 404)
})

// the quiz without its answer key; 404 when it isn't playable
app.get('/quizzes/:slug/play', async (c) => {
  const payload = await playPayload(c.env.DB, c.req.param('slug'))
  return payload ? c.json(payload) : c.json({ error: 'Không tìm thấy đề thi này.' }, 404)
})

app.get('/leaderboard/global', async (c) => c.json(await globalLeaderboard(c.env.DB, limitOf(c, 50))))
app.get('/leaderboard/endless', async (c) => c.json(await endlessLeaderboard(c.env.DB, limitOf(c, 50))))
app.get('/leaderboard/quiz/:quizId', async (c) => c.json(await quizLeaderboard(c.env.DB, c.req.param('quizId'), await viewerId(c), limitOf(c, 20))))

// ?user=<id>: a player's attempts, newest first
app.get('/attempts', async (c) => c.json(await attemptsOf(c.env.DB, c.req.query('user') ?? '', await viewerId(c), limitOf(c, 30))))

// ?quiz=&user=&exclude= -> { best }
app.get('/attempts/best', async (c) => {
  const q = c.req.query()
  return c.json({ best: await personalBest(c.env.DB, q.quiz ?? '', q.user ?? '', q.exclude || null) })
})

app.get('/attempts/:id', async (c) => {
  const entry = await attemptEntry(c.env.DB, c.req.param('id'), await viewerId(c))
  return entry ? c.json(entry) : c.json({ error: 'Không tìm thấy lượt làm bài.' }, 404)
})

app.get('/profiles/:username', async (c) => {
  const profile = await profileByUsername(c.env.DB, c.req.param('username'))
  return profile ? c.json(profile) : c.json({ error: 'Không tìm thấy người chơi.' }, 404)
})

// ------------------------------------------------------------------ playing (guests count as members)

app.use('/quizzes/:slug/start', members)
app.use('/quizzes/:slug/submit', members)

// -> { ticket_id, question_count }
app.post('/quizzes/:slug/start', async (c) => {
  const res = await startQuiz(c.env.DB, c.get('member'), c.req.param('slug'))
  track(c.env, 'quiz_started', { user: c.get('member').id, detail: c.req.param('slug'), value: res.question_count })
  return c.json(res)
})

// body: { answers: [{ question_id, option_id?, marks?: { [option id]: boolean }, text?, time_ms }], duration_seconds,
//   guest_name?, ticket_id } -> the review (worker/grading.ts reads the field that fits each question's kind)
app.post('/quizzes/:slug/submit', async (c) => {
  const res = await submitAttempt(c.env.DB, c.get('member'), { ...(await body(c)), slug: c.req.param('slug') })
  track(c.env, 'attempt_submitted', { user: c.get('member').id, detail: c.req.param('slug'), value: res.attempt.accuracy })
  return c.json(res)
})

// body: { limit?, exclude?: [ids], topic_id? } -> { questions, progress }; anyone (progress needs a session)
app.post('/endless/batch', async (c) => {
  const b = await body(c)
  const exclude = Array.isArray(b.exclude) ? b.exclude.map(String) : []
  return c.json(await nextBatch(c.env.DB, await viewerId(c), toInt(b.limit, 10), exclude, trimTo(b.topic_id, 64)))
})

app.use('/endless/sessions', members)
app.use('/endless/grade', members)

// body: { topic_id? } -> { id }
app.post('/endless/sessions', async (c) => c.json({ id: await startSession(c.env.DB, c.get('member'), trimTo((await body(c)).topic_id, 64)) }))

// body: { question_id, option_id, session_id? } -> the reveal
app.post('/endless/grade', async (c) => {
  const b = await body(c)
  const res = await gradeAnswer(c.env.DB, c.get('member'), String(b.question_id ?? ''), String(b.option_id ?? ''), trimTo(b.session_id, 64))
  track(c.env, 'endless_answer', { user: c.get('member').id, detail: res.is_correct ? 'correct' : 'wrong' })
  return c.json(res)
})

// ------------------------------------------------------------------ store and PayOS

app.get('/store/products', async (c) => c.json(await listProducts(c.env.DB)))

app.use('/payments/checkout', members)
app.use('/payments/sync', members)

// body: { product_id } -> { order_code, checkout_url }
app.post('/payments/checkout', async (c) => {
  const res = await checkout(c.env, c.get('member'), String((await body(c)).product_id ?? ''), new URL(c.req.url).origin)
  track(c.env, 'checkout', { user: c.get('member').id, detail: res.product_id, value: res.price_vnd })
  return c.json({ order_code: res.order_code, checkout_url: res.checkout_url })
})

// body: { order_code } -> { status, ad_free? }
app.post('/payments/sync', async (c) => {
  const res = await sync(c.env, c.get('member'), Number((await body(c)).order_code))
  if ('paid_now' in res && res.paid_now) track(c.env, 'order_paid', { user: c.get('member').id, detail: 'return', value: res.amount })
  return c.json({ status: res.status, ad_free: 'ad_free' in res ? res.ad_free : undefined })
})

// PayOS calls this (no session: it is signed with the checksum key)
app.post('/payments/webhook', async (c) => {
  const res = await webhook(c.env, (await c.req.json().catch(() => null)) as Parameters<typeof webhook>[1])
  if (res.result?.paid) track(c.env, 'order_paid', { user: res.result.userId ?? '', detail: 'webhook', value: res.result.amount })
  return c.json(res.body, res.status)
})

// ------------------------------------------------------------------ admin console

app.use('/manage/*', members, admins)

app.get('/manage/quizzes', async (c) => c.json(await myQuizzes(c.env.DB, c.get('member').id)))

// the editor's document -> { quiz, card, questions } (key included: it is the owner's quiz)
app.get('/manage/quizzes/:id', async (c) => {
  const doc = await quizForEdit(c.env.DB, c.get('member').id, c.req.param('id'))
  return doc ? c.json(doc) : c.json({ error: 'Không tìm thấy đề thi.' }, 404)
})

// body: the whole editor document -> { id, slug, status, question_count }
app.post('/manage/quizzes', async (c) => {
  const res = await saveQuiz(c.env.DB, c.get('member'), await body(c))
  track(c.env, 'quiz_saved', { user: c.get('member').id, detail: res.status, value: res.question_count })
  return c.json(res)
})

// body: { status?, visibility? }
app.patch('/manage/quizzes/:id', async (c) => {
  await updateQuizStatus(c.env.DB, c.get('member').id, c.req.param('id'), await body(c))
  return c.body(null, 204)
})

app.delete('/manage/quizzes/:id', async (c) => {
  await deleteQuiz(c.env.DB, c.get('member').id, c.req.param('id'))
  return c.body(null, 204)
})

app.get('/manage/quizzes/:id/report', async (c) => {
  const report = await quizReport(c.env.DB, c.get('member').id, c.req.param('id'))
  return report ? c.json(report) : c.json({ error: 'Không tìm thấy đề thi.' }, 404)
})

// the whole site, for the stats page
app.get('/manage/overview', async (c) => c.json(await adminOverview(c.env.DB)))
app.get('/manage/users', async (c) => c.json(await adminUsers(c.env.DB, c.req.query())))
app.get('/manage/orders', async (c) => c.json(await adminOrders(c.env.DB, c.req.query())))

app.get('/manage/attempts',async (c) => c.json(await attemptsForOwner(c.env.DB, c.get('member').id, limitOf(c, 25))))

// body: { csv, filename? } -> { subjects, quizzes, questions, total_rows, skipped, skipped_total, filename }
app.post('/manage/import', async (c) => {
  const res = await importQuestions(c.env.DB, c.get('member'), await body(c))
  track(c.env, 'questions_imported', { user: c.get('member').id, value: res.questions })
  return c.json(res)
})

// body: { topic, level?, difficulty?, count?, notes? } -> { questions, provider, credits }
app.post('/manage/ai', async (c) => {
  const res = await generateQuestions(c.env, c.get('member'), await body(c))
  track(c.env, 'ai_generated', { user: c.get('member').id, detail: res.provider, value: res.questions.length })
  return c.json(res)
})

app.notFound((c) => c.json({ error: 'Không tìm thấy.' }, 404))

export default app
