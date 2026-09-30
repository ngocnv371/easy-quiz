import { RouterProvider } from 'react-router-dom'

import { AuthProvider } from '@/features/auth/auth-context'
import { AppToaster } from '@/components/ui/toaster'

import { router } from './router'

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <AppToaster />
    </AuthProvider>
  )
}
