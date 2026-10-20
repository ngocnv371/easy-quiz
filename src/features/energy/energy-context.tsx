import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { useAuth } from '@/features/auth/auth-context'

import { fetchMyEnergy, type EnergyState } from './api'

interface EnergyContextValue {
  /** Null until loaded, and while nobody is signed in. */
  energy: EnergyState | null
  loading: boolean
  refresh: () => Promise<void>
  /** Adopt a balance the server returned alongside another call. */
  update: (energy: EnergyState | null | undefined) => void
  /** Opens the shared out-of-energy dialog. */
  showOutOfEnergy: (energy?: EnergyState | null) => void
  outOfEnergyOpen: boolean
  closeOutOfEnergy: () => void
}

const EnergyContext = createContext<EnergyContextValue | null>(null)

/**
 * Keeps the signed-in player's energy in one place, so the header meter, the
 * player screens and the shop all agree. Spends report the new balance in
 * their responses (`update`); everything else re-reads it (`refresh`).
 */
export function EnergyProvider({ children }: { children: ReactNode }) {
  const { user, isConfigured, status } = useAuth()
  const userId = user?.id ?? null

  const [energy, setEnergy] = useState<EnergyState | null>(null)
  const [loading, setLoading] = useState(false)
  const [outOfEnergyOpen, setOutOfEnergyOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (!isConfigured || !userId) {
      setEnergy(null)
      return
    }

    setLoading(true)
    try {
      setEnergy(await fetchMyEnergy())
    } catch {
      // The meter is informational; a failed read must not break the page.
    } finally {
      setLoading(false)
    }
  }, [isConfigured, userId])

  useEffect(() => {
    if (status !== 'ready') return
    void refresh()
  }, [status, refresh])

  // The free allowance refills at midnight; re-read when the page is revisited
  // so a tab left open overnight does not show yesterday's balance.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  const update = useCallback((next: EnergyState | null | undefined) => {
    if (next) setEnergy(next)
  }, [])

  const showOutOfEnergy = useCallback((next?: EnergyState | null) => {
    if (next) setEnergy(next)
    setOutOfEnergyOpen(true)
  }, [])

  const closeOutOfEnergy = useCallback(() => setOutOfEnergyOpen(false), [])

  const value = useMemo<EnergyContextValue>(
    () => ({
      energy,
      loading,
      refresh,
      update,
      showOutOfEnergy,
      outOfEnergyOpen,
      closeOutOfEnergy,
    }),
    [energy, loading, refresh, update, showOutOfEnergy, outOfEnergyOpen, closeOutOfEnergy],
  )

  return <EnergyContext.Provider value={value}>{children}</EnergyContext.Provider>
}

export function useEnergy(): EnergyContextValue {
  const context = useContext(EnergyContext)
  if (!context) throw new Error('useEnergy must be used inside <EnergyProvider>.')
  return context
}
