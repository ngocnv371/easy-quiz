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

import { api } from '@/lib/api'
import type { ProfileRow, UserRole } from '@/lib/domain'
import { asRole } from '@/lib/domain'

import { authClient } from './auth-client'
import { SESSION_ENDED_MESSAGE, authErrorMessage } from './errors'

export interface SignUpInput {
  email: string
  password: string
  displayName: string
  organization?: string
}

/** The same details, but applied to the anonymous session already in hand. */
export type UpgradeGuestInput = SignUpInput

/** The signed-in account, as `/api/me` reports it. */
export interface AuthUser {
  id: string
  /** Null for a guest: their placeholder address is not one to show. */
  email: string | null
  emailVerified: boolean
  isAnonymous: boolean
}

interface MeResponse {
  user: AuthUser | null
  profile: ProfileRow | null
}

interface AuthContextValue {
  /** Always true: the API is served by the same Worker as the page. */
  isConfigured: boolean
  status: 'loading' | 'ready'
  user: AuthUser | null
  profile: ProfileRow | null
  isGuest: boolean
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
  /** A message the UI can surface instead of a raw error. */
  authError: string | null
  clearAuthError: () => void
  /**
   * Set when a session went away underneath us — expired, or signed out on
   * another device. The UI shows it once and clears it.
   */
  sessionNotice: string | null
  clearSessionNotice: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const [authError, setAuthError] = useState<string | null>(null)
  const [sessionNotice, setSessionNotice] = useState<string | null>(null)

  // Who we believe is signed in, so a vanished session can be told apart from
  // a visitor who never had one.
  const userIdRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    let me: MeResponse
    try {
      me = await api<MeResponse>('me')
    } catch {
      // Offline or a server hiccup: keep what we have rather than signing out.
      setStatus('ready')
      return
    }

    if (userIdRef.current && !me.user) setSessionNotice(SESSION_ENDED_MESSAGE)

    userIdRef.current = me.user?.id ?? null
    setUser(me.user ? { ...me.user, email: me.user.isAnonymous ? null : me.user.email } : null)
    setProfile(me.profile)
    setStatus('ready')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** One exit for every auth failure: a message a person can act on. */
  const fail = useCallback((error: unknown): never => {
    const message = authErrorMessage(error)
    setAuthError(message)
    throw new Error(message)
  }, [])

  const signIn = useCallback(
    async (email: string, password: string) => {
      setAuthError(null)
      const { error } = await authClient.signIn.email({ email: email.trim(), password })
      if (error) fail(error)
      userIdRef.current = null
      await load()
    },
    [fail, load],
  )

  const signUp = useCallback(
    async (input: SignUpInput) => {
      setAuthError(null)

      const { data, error } = await authClient.signUp.email({
        email: input.email.trim(),
        password: input.password,
        name: input.displayName.trim(),
        organization: input.organization?.trim() || undefined,
        // Where the confirmation link lands, signed in.
        callbackURL: '/account',
      })

      if (error) fail(error)

      // Email confirmation is required, so a new account has no session yet —
      // the caller shows a "check your inbox" screen instead of pretending the
      // person is signed in.
      const signedIn = Boolean(data && 'token' in data && data.token)
      if (signedIn) await load()
      return { needsEmailConfirmation: !signedIn }
    },
    [fail, load],
  )

  const signInAsGuest = useCallback(
    async (name: string) => {
      setAuthError(null)

      if (!userIdRef.current) {
        const { error } = await authClient.signIn.anonymous()
        if (error) fail(error)
      }

      const trimmed = name.trim()
      if (trimmed !== '') {
        try {
          await api('me/profile', { method: 'PATCH', body: { display_name: trimmed.slice(0, 60) } })
        } catch (error) {
          // A failed rename must not block play — the placeholder name is fine.
          setAuthError(authErrorMessage(error))
        }
      }

      userIdRef.current = null
      await load()
    },
    [fail, load],
  )

  const signOut = useCallback(async () => {
    userIdRef.current = null
    setUser(null)
    setProfile(null)
    await authClient.signOut()
    await load()
  }, [load])

  const updateProfile = useCallback(async (patch: Partial<ProfileRow>) => {
    if (!userIdRef.current) throw new Error('Bạn cần đăng nhập.')
    const updated = await api<ProfileRow>('me/profile', { method: 'PATCH', body: patch })
    setProfile(updated)
  }, [])

  const refreshProfile = useCallback(async () => {
    await load()
  }, [load])

  const upgradeGuest = useCallback(
    async (input: UpgradeGuestInput) => {
      setAuthError(null)

      // Converts the guest in place — same id, same profile, same history.
      let result: { needsEmailConfirmation: boolean }
      try {
        result = await api<{ needsEmailConfirmation: boolean }>('me/upgrade', {
          method: 'POST',
          body: {
            email: input.email.trim(),
            password: input.password,
            displayName: input.displayName.trim(),
            organization: input.organization?.trim() || null,
          },
        })
      } catch (error) {
        fail(error)
      }

      await load()
      return result!
    },
    [fail, load],
  )

  const clearSessionNotice = useCallback(() => setSessionNotice(null), [])

  const value = useMemo<AuthContextValue>(() => {
    const role = asRole(profile?.role ?? null)

    return {
      isConfigured: true,
      status,
      user,
      profile,
      // The session is the authority on whether someone is a guest; the
      // profile's `is_guest` is only the leaderboard's flag.
      isGuest: user?.isAnonymous ?? false,
      isAdmin: role === 'admin',
      role,
      displayName: profile?.display_name ?? (user?.email ? user.email.split('@')[0]! : 'Khách'),
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
    user,
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
