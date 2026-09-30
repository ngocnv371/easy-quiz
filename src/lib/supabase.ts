import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

/**
 * The app boots without a backend — the landing page is fully static — so the
 * client is nullable rather than throwing at import time. Anything that needs
 * data goes through `requireSupabase()` or the `useSupabase()` hook, both of
 * which produce an actionable message when the environment is incomplete.
 */
export const isSupabaseConfigured = url !== '' && anonKey !== ''
export const supabaseUrl = url

export type AppSupabaseClient = SupabaseClient<Database>

export const supabase: AppSupabaseClient | null = isSupabaseConfigured
  ? createClient<Database>(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'easy-quiz.auth',
      },
      db: { schema: 'public' },
    })
  : null

export class SupabaseNotConfiguredError extends Error {
  readonly hint: string

  constructor() {
    super('Easy Quiz chưa được kết nối tới Supabase.')
    this.name = 'SupabaseNotConfiguredError'
    this.hint =
      'Sao chép `.env.example` thành `.env.local`, chạy `npm run supabase:start` rồi dán URL và anon key vào đó.'
  }
}

export function requireSupabase(): AppSupabaseClient {
  if (!supabase) throw new SupabaseNotConfiguredError()
  return supabase
}
