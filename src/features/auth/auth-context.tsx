import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'

import { errorMessage } from '@/lib/utils'
import type { ProfileRow, UserRole } from '@/lib/domain'
import { asRole } from '@/lib/domain'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

import { DEAD_SESSION_MESSAGE, authErrorMessage, isDeadSessionError } from './errors'

export interface SignUpInput {
  email: string
  password: string
  displayName: string
  role: Exclude<UserRole, 'admin'>
  school?: string
}

/** The same details, but applied to the anonymous session already in hand. */
export type UpgradeGuestInput = SignUpInput

interface AuthContextValue {
  /** False when `.env.local` has no Supabase credentials yet. */
  isConfigured: boolean
  status: 'loading' | 'ready'
  session: Session | null
  user: User | null
  profile: ProfileRow | null
  isGuest: boolean
  isTeacher: boolean
  isAdmin: boolean
  displayName: string
  role: UserRole
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: SignUpInput) => Promise<{ needsEmailConfirmation: boolean }>
  signInAsGuest: (name: string) => Promise<void>
  /**
   * Turns the current anonymous session into a permanent account.
   *
   * The user id is preserved, so the profile and every attempt already recorded
   * stay attached. Creating a new account instead would start from zero.
   */
  upgradeGuest: (input: UpgradeGuestInput) => Promise<{ needsEmailConfirmation: boolean }>
  signOut: () => Promise<void>
  updateProfile: (patch: Partial<ProfileRow>) => Promise<void>
  refreshProfile: () => Promise<void>
  /** A message the UI can surface instead of a raw Supabase error. */
  authError: string | null
  clearAuthError: () => void
  /**
   * Set when a session had to be thrown away — for example the account behind
   * it no longer exists. The UI shows it once and clears it.
   */
  sessionNotice: string | null
  clearSessionNotice: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function isAnonymous(user: User | null): boolean {
  if (!user) return false
  if (typeof user.is_anonymous === 'boolean') return user.is_anonymous
  return user.app_metadata?.provider === 'anonymous'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const [authError, setAuthError] = useState<string | null>(null)
  const [sessionNotice, setSessionNotice] = useState<string | null>(null)

  // Guards against a slow profile fetch resolving after the user signed out.
  const userIdRef = useRef<string | null>(null)

  /**
   * Throws the current session away and says why.
   *
   * Local-only: the account is already gone on the server, so a global revoke
   * would just fail with the same error we are recovering from.
   */
  const discardSession = useCallback(async (notice: string) => {
    userIdRef.current = null
    setProfile(null)
    setSession(null)
    setSessionNotice(notice)

    if (supabase) await supabase.auth.signOut({ scope: 'local' })
  }, [])

  const loadProfile = useCallback(
    async (user: User | null) => {
      if (!supabase || !user) {
        setProfile(null)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      // Drop a stale response if the session moved on while we were fetching.
      if (userIdRef.current !== user.id) return

      // A row always exists for a live user (the sign-up trigger creates it),
      // so an empty result means the account is gone while the token is not.
      // Recovering here beats letting every later request fail on its own.
      if (!error && !data) {
        await discardSession(DEAD_SESSION_MESSAGE)
        return
      }

      setProfile(data ?? null)
    },
    [discardSession],
  )

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setStatus('ready')
      return
    }

    let active = true

    // `onAuthStateChange` fires an INITIAL_SESSION event, so the explicit
    // getSession() call below is only a safety net for very fast mounts.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return

      userIdRef.current = next?.user?.id ?? null
      setSession(next)
      setStatus('ready')

      // Synchronous callbacks must not await Supabase, so defer the read.
      void loadProfile(next?.user ?? null)
    })

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      userIdRef.current = data.session?.user?.id ?? null
      setSession(data.session)
      setStatus('ready')
      void loadProfile(data.session?.user ?? null)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [loadProfile])

  /**
   * One exit for every auth failure: recover from a dead session, or surface a
   * message a person can act on.
   */
  const fail = useCallback(
    async (error: unknown): Promise<never> => {
      if (isDeadSessionError(error)) {
        await discardSession(DEAD_SESSION_MESSAGE)
        throw new Error(DEAD_SESSION_MESSAGE)
      }

      const message = authErrorMessage(error)
      setAuthError(message)
      throw new Error(message)
    },
    [discardSession],
  )

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) throw new Error('Supabase chưa được cấu hình.')
      setAuthError(null)

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) await fail(error)
    },
    [fail],
  )

  const signUp = useCallback(
    async (input: SignUpInput) => {
      if (!supabase) throw new Error('Supabase chưa được cấu hình.')
      setAuthError(null)

      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          data: {
            display_name: input.displayName.trim(),
            role: input.role,
            school: input.school?.trim() || null,
          },
        },
      })

      if (error) await fail(error)

      // With email confirmation switched on, Supabase returns a user but no
      // session — the caller then shows a "check your inbox" screen instead of
      // pretending the person is signed in.
      return { needsEmailConfirmation: data.session === null }
    },
    [fail],
  )

  const signInAsGuest = useCallback(async (name: string) => {
    if (!supabase) throw new Error('Supabase chưa được cấu hình.')
    setAuthError(null)

    const existing = await supabase.auth.getSession()
    const currentUser = existing.data.session?.user

    const { data, error } =
      currentUser && isAnonymous(currentUser)
        ? { data: { user: currentUser }, error: null }
        : await supabase.auth.signInAnonymously()

    if (error) await fail(error)

    const user = data.user
    if (!user) throw new Error('Không tạo được phiên chơi ẩn danh.')

    const trimmed = name.trim()
    if (trimmed !== '') {
      // The trigger has already created the profile row, so this is an update.
      const { data: updated, error: profileError } = await supabase
        .from('profiles')
        .update({ display_name: trimmed.slice(0, 60) })
        .eq('id', user.id)
        .select('*')
        .maybeSingle()

      if (profileError) {
        // A failed rename must not block play — the placeholder name is fine.
        setAuthError(errorMessage(profileError))
      } else if (updated) {
        setProfile(updated)
      }
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    userIdRef.current = null
    setProfile(null)
    await supabase.auth.signOut()
  }, [])

  const updateProfile = useCallback(
    async (patch: Partial<ProfileRow>) => {
      if (!supabase) throw new Error('Supabase chưa được cấu hình.')
      const userId = userIdRef.current
      if (!userId) throw new Error('Bạn cần đăng nhập.')

      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', userId)
        .select('*')
        .maybeSingle()

      if (error) throw new Error(errorMessage(error))
      if (data) setProfile(data)
    },
    [],
  )

  const refreshProfile = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    await loadProfile(data.session?.user ?? null)
  }, [loadProfile])

  const upgradeGuest = useCallback(
    async (input: UpgradeGuestInput) => {
      if (!supabase) throw new Error('Supabase chưa được cấu hình.')
      setAuthError(null)

      const email = input.email.trim()

      // `updateUser` converts the anonymous user in place — same id, same
      // profile, same attempt history.
      const { data, error } = await supabase.auth.updateUser({
        email,
        password: input.password,
        data: {
          display_name: input.displayName.trim(),
          role: input.role,
          school: input.school?.trim() || null,
        },
      })

      if (error) await fail(error)

      // With email confirmation switched on, the address only lands once the
      // link is followed, so `user.email` still reads as null here.
      const applied = data.user?.email?.toLowerCase() === email.toLowerCase()

      // Run while the profile is still flagged as a guest — that flag is the
      // guard this function checks.
      const { error: profileError } = await supabase.rpc('upgrade_guest_profile', {
        p_display_name: input.displayName.trim(),
        p_role: input.role,
        // `undefined` rather than `null`: the argument is optional, and the SQL
        // default is already null.
        p_school: input.school?.trim() || undefined,
      })

      if (profileError) throw new Error(errorMessage(profileError))

      await refreshProfile()
      return { needsEmailConfirmation: !applied }
    },
    [refreshProfile],
  )

  const clearSessionNotice = useCallback(() => setSessionNotice(null), [])

  const value = useMemo<AuthContextValue>(() => {
    const guest = isAnonymous(session?.user ?? null)
    const role = asRole(profile?.role ?? null)

    return {
      isConfigured: isSupabaseConfigured,
      status,
      session,
      user: session?.user ?? null,
      profile,
      // The session is the authority on whether someone is a guest. The
      // `profiles.is_guest` column is only an aggregation flag for the
      // leaderboard, so it must not drive this.
      isTeacher: role === 'teacher' || role === 'admin',
      isAdmin: role === 'admin',
      role,
      isGuest: guest,
      displayName:
        profile?.display_name ??
        (session?.user?.email ? session.user.email.split('@')[0] : 'Khách'),
      signIn,
      signUp,
      signInAsGuest,
      upgradeGuest,
      signOut,
      updateProfile,
      refreshProfile,
      authError,
      clearAuthError: () => setAuthError(null),
      sessionNotice,
      clearSessionNotice,
    }
  }, [
    status,
    session,
    profile,
    authError,
    sessionNotice,
    clearSessionNotice,
    signIn,
    signUp,
    signInAsGuest,
    upgradeGuest,
    signOut,
    updateProfile,
    refreshProfile,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth phải được dùng bên trong <AuthProvider>.')
  }

  return context
}
