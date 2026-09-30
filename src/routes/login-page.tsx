import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, Mail } from 'lucide-react'

import { Alert } from '@/components/ui/feedback'
import { Button, ButtonLink } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { AuthShell } from '@/features/auth/auth-shell'
import { useAuth } from '@/features/auth/auth-context'
import { errorMessage } from '@/lib/utils'

/** Only same-origin relative paths are honoured, so `?redirect=` cannot be abused. */
function safeRedirect(value: string | null): string {
  if (!value) return '/explore'
  if (!value.startsWith('/') || value.startsWith('//')) return '/explore'
  return value
}

export function LoginPage() {
  const { signIn, user, status, isConfigured, isGuest } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const redirectTo = safeRedirect(params.get('redirect'))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A guest is technically signed in, but they still need this page — either
  // to sign into a different account or to realise they should save this one.
  if (isConfigured && status === 'ready' && user && !isGuest) {
    return <Navigate to={redirectTo} replace />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await signIn(email, password)
      navigate(redirectTo, { replace: true })
    } catch (signInError) {
      setError(errorMessage(signInError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Chào mừng trở lại"
      description="Đăng nhập để tiếp tục chuỗi ngày học của bạn và giữ thành tích trên bảng xếp hạng."
      footer={
        <>
          Chưa có tài khoản?{' '}
          <Link to="/register" className="text-neon-300 font-medium hover:underline">
            Tạo tài khoản mới
          </Link>
        </>
      }
    >
      {!isConfigured ? (
        <Alert tone="warning" title="Chưa kết nối Supabase" className="mb-5">
          Hãy sao chép <code>.env.example</code> thành <code>.env.local</code> và điền URL cùng
          anon key trước khi đăng nhập.
        </Alert>
      ) : null}

      {isGuest ? (
        <Alert tone="warning" title="Bạn đang có một phiên chơi khách" className="mb-5">
          Đăng nhập bằng tài khoản khác sẽ <strong>thay thế</strong> phiên này, và điểm đã chơi
          sẽ không được giữ. Muốn giữ chúng?{' '}
          <Link to="/register" className="font-medium underline">
            Lưu kết quả của bạn
          </Link>{' '}
          trước đã.
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="error" className="mb-5">
          {error}
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" required>
          <div className="relative">
            <Mail
              className="text-ink-400 pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ban@truong.edu.vn"
              className="pl-10"
            />
          </div>
        </Field>

        <Field label="Mật khẩu" htmlFor="password" required>
          <div className="relative">
            <KeyRound
              className="text-ink-400 pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="pl-10"
            />
          </div>
        </Field>

        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Đăng nhập
        </Button>
      </form>

      <div className="mt-6">
        <div className="text-ink-500 flex items-center gap-3 text-xs">
          <span className="bg-ink-600/60 h-px flex-1" />
          hoặc
          <span className="bg-ink-600/60 h-px flex-1" />
        </div>

        <ButtonLink to="/explore" variant="outline" size="lg" className="mt-5 w-full">
          Chơi thử không cần tài khoản
        </ButtonLink>
      </div>
    </AuthShell>
  )
}
