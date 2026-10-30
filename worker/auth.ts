// Accounts: Better Auth (https://www.better-auth.com) on D1. Email + password with the address
// confirmed by email, and anonymous guests ("Chơi ngay") through the anonymous plugin: a guest is a
// real user row, so their scores land on the leaderboard straight away, and upgradeGuest() below
// turns that same row into an account, so nothing they earned is lost.
//
// Every user has a profile (the app's table, migrations/0002_app.sql), created with the user.
// Tables: migrations/0001_auth.sql, generated from these options by `npm run db:auth-schema`.
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { anonymous } from 'better-auth/plugins'
import type { Context, MiddlewareHandler } from 'hono'

import { sendAccountEmail } from './email.ts'
import type { AppEnv, Env, Member } from './env.ts'
import { track } from './events.ts'
import { AppError, NOW } from './sql.ts'

export const PASSWORD_MIN = 6

// the part of the request's execution context auth needs (Hono and Workers type it differently)
type WaitUntil = { waitUntil(promise: Promise<unknown>): void }

const guestName = () => `Khách ${String(1 + Math.floor(Math.random() * 9999)).padStart(4, '0')}`

export function authOptions(env: Env, ctx?: WaitUntil) {
  // emails go out after the reply, so how long sending takes can't tell anyone whether an address has an account
  const later = (p: Promise<unknown>) => (ctx ? ctx.waitUntil(p.catch((e) => console.error('auth email', e))) : p)
  return {
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    basePath: '/api/auth',
    // the host the request came to, if it is one of ours (AUTH_HOSTS in wrangler.jsonc): links in
    // emails then lead back to that site, or to localhost in dev
    baseURL: { allowedHosts: (env.AUTH_HOSTS ?? '').split(',').filter(Boolean), fallback: env.SITE_URL },
    trustedOrigins: (req?: Request) => (req ? [new URL(req.url).origin] : []),
    user: {
      additionalFields: {
        // the school or organisation given at sign-up; copied into the profile
        organization: { type: 'string', required: false, input: true },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: PASSWORD_MIN,
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        later(sendAccountEmail(env, { to: user.email, kind: 'verify', url }))
      },
      afterEmailVerification: async (user) => track(env, 'email_verified', { user: user.id }),
    },
    plugins: [
      anonymous({
        emailDomainName: 'guest.easyquiz.invalid',
        generateName: guestName,
        // a guest who signs in to another account keeps their rows (and leaderboard places)
        disableDeleteAnonymousUser: true,
      }),
    ],
    // counters in D1, not in memory: a Worker isolate doesn't live long enough to count
    rateLimit: { enabled: true, storage: 'database' },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await ensureProfile(env.DB, user as AuthUser)
            track(env, (user as AuthUser).isAnonymous ? 'guest' : 'signup', { user: user.id })
          },
        },
      },
      session: { create: { after: async (s) => track(env, 'sign_in', { user: s.userId }) } },
    },
  } satisfies BetterAuthOptions
}

// One instance per request: the bindings and the request's waitUntil come with the request.
export const authFor = (env: Env, ctx?: WaitUntil) => betterAuth(authOptions(env, ctx))

interface AuthUser {
  id: string
  email: string
  name: string
  isAnonymous?: boolean | null
  organization?: string | null
}

// The profile for a new user: a display name from what they gave (or "Khách 1234" for a guest),
// and a unique username from the email's local part. Never an admin: that is promoted by hand
// (scripts/promote-admin.mjs).
export async function ensureProfile(db: D1Database, user: AuthUser) {
  const guest = Boolean(user.isAnonymous)
  const local = guest ? '' : (user.email.split('@')[0] ?? '').trim()
  const display = (user.name?.trim() || local || (guest ? guestName() : 'Người chơi')).slice(0, 60)
  let base = (local || 'player').replace(/[^a-zA-Z0-9_]+/g, '').toLowerCase()
  if (base.length < 3) base = 'player'
  const username = `${base.slice(0, 24)}_${user.id.replace(/-/g, '').slice(0, 5).toLowerCase()}`
  await db
    .prepare(`insert into profiles (id, username, display_name, is_guest, organization) values (?, ?, ?, ?, ?)
      on conflict (id) do nothing`)
    .bind(user.id, username, display, guest ? 1 : 0, user.organization?.trim().slice(0, 120) || null)
    .run()
}

// The signed-in member behind a request, or null.
export async function memberOf(c: Context<AppEnv>): Promise<Member | null> {
  const session = await authFor(c.env, c.executionCtx).api.getSession({ headers: c.req.raw.headers })
  const user = session?.user as AuthUser | undefined
  if (!user) return null
  const profileOf = () =>
    c.env.DB.prepare('select role, is_guest from profiles where id = ?').bind(user.id).first<{ role: 'user' | 'admin'; is_guest: number }>()
  let profile = await profileOf()
  if (!profile) {
    // the hook that makes it failed, or the user predates it: make it now
    await ensureProfile(c.env.DB, user)
    profile = await profileOf()
  }
  return {
    id: user.id,
    email: user.email,
    isAnonymous: Boolean(user.isAnonymous),
    role: profile?.role ?? 'user',
    isGuest: Boolean(profile?.is_guest),
  }
}

// c.get('member') for the routes it guards; 401 without a session
export const members: MiddlewareHandler<AppEnv> = async (c, next) => {
  const member = await memberOf(c)
  if (!member) throw new AppError('Bạn cần đăng nhập.', 401, 'signed_out')
  c.set('member', member)
  await next()
}

export const admins: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('member')?.role !== 'admin') throw new AppError('Chỉ quản trị viên mới làm được việc này.', 403, 'not_admin')
  await next()
}

// A guest becomes an account in place: the same user id, so the profile, attempts, Endless runs
// and ad-free pass all stay. The address still has to be confirmed by email before it can sign in
// elsewhere; this session carries on meanwhile. Refused for anyone who isn't a guest, so it can't
// re-label an account (and it never touches `role`).
export async function upgradeGuest(
  c: Context<AppEnv>,
  input: { email?: unknown; password?: unknown; displayName?: unknown; organization?: unknown },
) {
  const member = c.get('member')
  if (!member.isAnonymous && !member.isGuest) throw new AppError('Tài khoản này đã là tài khoản chính thức.', 403)

  const email = String(input.email ?? '').trim().toLowerCase()
  const password = String(input.password ?? '')
  const displayName = String(input.displayName ?? '').trim().slice(0, 60)
  const organization = String(input.organization ?? '').trim().slice(0, 120) || null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('Email không hợp lệ.')
  if (password.length < PASSWORD_MIN) throw new AppError(`Mật khẩu cần ít nhất ${PASSWORD_MIN} ký tự.`)

  const auth = authFor(c.env, c.executionCtx)
  const context = await auth.$context
  if (await context.internalAdapter.findUserByEmail(email)) {
    throw new AppError('Email này đã được dùng cho một tài khoản khác.', 409, 'email_taken')
  }

  const hash = await context.password.hash(password)
  await c.env.DB.batch([
    c.env.DB.prepare(`update user set email = ?2, emailVerified = 0, isAnonymous = 0, name = coalesce(nullif(?3, ''), name),
        organization = ?4, updatedAt = ${NOW} where id = ?1`).bind(member.id, email, displayName, organization),
    c.env.DB.prepare(`insert into account (id, accountId, providerId, userId, password, createdAt, updatedAt)
        values (?1, ?2, 'credential', ?2, ?3, ${NOW}, ${NOW})`).bind(crypto.randomUUID(), member.id, hash),
    c.env.DB.prepare(`update profiles set display_name = coalesce(nullif(?2, ''), display_name), organization = ?3,
        is_guest = 0, updated_at = ${NOW} where id = ?1`).bind(member.id, displayName, organization),
  ])
  track(c.env, 'guest_upgraded', { user: member.id })

  await auth.api.sendVerificationEmail({ body: { email, callbackURL: '/account' }, headers: c.req.raw.headers })
  return { needsEmailConfirmation: true }
}
