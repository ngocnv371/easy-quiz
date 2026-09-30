import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { toast } from 'sonner'

import { AppToaster } from '@/components/ui/toaster'
import { AuthProvider, useAuth } from '@/features/auth/auth-context'

import { router } from './router'

/**
 * Announces a session that had to be discarded.
 *
 * Recovering silently would be worse than the original error: the player would
 * suddenly be a guest again, with their name and scores gone and no explanation.
 */
function SessionNoticeWatcher() {
  const { sessionNotice, clearSessionNotice } = useAuth()

  useEffect(() => {
    if (!sessionNotice) return

    toast.warning(sessionNotice, { duration: 10_000 })
    clearSessionNotice()
  }, [sessionNotice, clearSessionNotice])

  return null
}

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <SessionNoticeWatcher />
      <AppToaster />
    </AuthProvider>
  )
}
