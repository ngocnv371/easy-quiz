// The Worker's bindings (wrangler.jsonc) and secrets (.dev.vars locally, `wrangler secret put` on
// Cloudflare). Everything optional here has a sensible behaviour when it is missing.
export interface Env {
  DB: D1Database
  EVENTS?: AnalyticsEngineDataset
  ASSETS: Fetcher

  SITE_URL: string
  AUTH_HOSTS?: string
  EMAIL_FROM: string
  BETTER_AUTH_SECRET: string
  RESEND_API_KEY?: string

  PAYOS_CLIENT_ID?: string
  PAYOS_API_KEY?: string
  PAYOS_CHECKSUM_KEY?: string
  PAYOS_MOCK?: string

  AI_PROVIDER?: string
  AI_CREDIT_COST?: string
  GEMINI_API_KEY?: string
  GEMINI_MODEL?: string
  OPENAI_API_KEY?: string
  OPENAI_MODEL?: string
  OPENAI_BASE_URL?: string
  DEEPSEEK_API_KEY?: string
  DEEPSEEK_MODEL?: string
  DEEPSEEK_BASE_URL?: string
}

// The signed-in account behind a request (worker/auth.ts), with its profile.
export interface Member {
  id: string
  email: string
  isAnonymous: boolean
  role: 'user' | 'admin'
  isGuest: boolean
}

export type AppEnv = { Bindings: Env; Variables: { member: Member } }
