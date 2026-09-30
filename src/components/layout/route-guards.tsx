import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'

import { Alert } from '@/components/ui/feedback'
import { ButtonLink, Spinner } from '@/components/ui/button'
import { AuroraBackground } from '@/components/brand/aurora-background'
import { useAuth } from '@/features/auth/auth-context'

function AuthLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner className="text-neon-400 size-7" />
      <span className="sr-only">Đang tải…</span>
    </div>
  )
}

/** Sends anonymous visitors to sign in, remembering where they were headed. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, user, isConfigured } = useAuth()
  const location = useLocation()

  if (!isConfigured) return <>{children}</>
  if (status === 'loading') return <AuthLoading />

  if (!user) {
    const redirect = `${location.pathname}${location.search}`
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />
  }

  return <>{children}</>
}

/** The teacher console: students have no business here. */
export function RequireTeacher({ children }: { children: ReactNode }) {
  const { status, user, isTeacher, isConfigured } = useAuth()
  const location = useLocation()

  if (!isConfigured) return <>{children}</>
  if (status === 'loading') return <AuthLoading />

  if (!user) {
    const redirect = `${location.pathname}${location.search}`
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />
  }

  if (!isTeacher) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5">
        <AuroraBackground />

        <div className="relative w-full max-w-lg space-y-4">
          <Alert
            tone="warning"
            icon={ShieldAlert}
            title="Khu vực dành cho giáo viên"
          >
            Tài khoản của bạn đang là học sinh. Nếu bạn là giáo viên, hãy tạo một tài khoản
            mới với vai trò <strong>Giáo viên</strong> — hoặc liên hệ quản trị viên để được
            nâng quyền.
          </Alert>

          <div className="flex justify-center gap-3">
            <ButtonLink to="/explore" variant="outline">
              Về trang khám phá
            </ButtonLink>
            <ButtonLink to="/register" variant="primary">
              Tạo tài khoản giáo viên
            </ButtonLink>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
