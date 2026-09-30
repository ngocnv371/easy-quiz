import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { GraduationCap, KeyRound, Mail, School, UserRound } from 'lucide-react'

import { Alert } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { ChoiceTile, Field, Input } from '@/components/ui/field'
import { AuthShell } from '@/features/auth/auth-shell'
import { useAuth } from '@/features/auth/auth-context'
import { ROLE_DESCRIPTIONS } from '@/lib/labels'
import { errorMessage } from '@/lib/utils'
import type { UserRole } from '@/lib/domain'

type SignUpRole = Exclude<UserRole, 'admin'>

export function RegisterPage() {
  const { signUp, user, status, isConfigured } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<SignUpRole>('student')
  const [school, setSchool] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  if (isConfigured && status === 'ready' && user && !needsConfirmation) {
    return <Navigate to={role === 'teacher' ? '/manage' : '/explore'} replace />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (displayName.trim().length < 2) {
      setError('Hãy nhập tên hiển thị ít nhất 2 ký tự.')
      return
    }

    if (password.length < 6) {
      setError('Mật khẩu cần ít nhất 6 ký tự.')
      return
    }

    setSubmitting(true)

    try {
      const { needsEmailConfirmation } = await signUp({
        email,
        password,
        displayName,
        role,
        school,
      })

      if (needsEmailConfirmation) {
        setNeedsConfirmation(true)
      } else {
        navigate(role === 'teacher' ? '/manage' : '/explore', { replace: true })
      }
    } catch (signUpError) {
      setError(errorMessage(signUpError))
    } finally {
      setSubmitting(false)
    }
  }

  if (needsConfirmation) {
    return (
      <AuthShell
        title="Kiểm tra hộp thư của bạn"
        description="Chúng tôi đã gửi một liên kết xác nhận. Bấm vào đó để kích hoạt tài khoản, rồi quay lại đăng nhập."
        footer={
          <Link to="/login" className="text-neon-300 font-medium hover:underline">
            Về trang đăng nhập
          </Link>
        }
      >
        <Alert tone="success" title="Đã gửi email xác nhận">
          Nếu sau vài phút vẫn chưa thấy, hãy kiểm tra thư mục spam.
        </Alert>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Tạo tài khoản Easy Quiz"
      description="Miễn phí, không cần thẻ. Bạn có thể bắt đầu với vai trò học sinh và nâng lên giáo viên bất cứ lúc nào."
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link to="/login" className="text-neon-300 font-medium hover:underline">
            Đăng nhập
          </Link>
        </>
      }
    >
      {!isConfigured ? (
        <Alert tone="warning" title="Chưa kết nối Supabase" className="mb-5">
          Hãy sao chép <code>.env.example</code> thành <code>.env.local</code> trước khi đăng ký.
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="error" className="mb-5">
          {error}
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Field
          label="Tên hiển thị"
          htmlFor="displayName"
          required
          hint="Tên này xuất hiện trên bảng xếp hạng."
        >
          <div className="relative">
            <UserRound
              className="text-ink-400 pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              id="displayName"
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Ngọc Anh"
              maxLength={60}
              className="pl-10"
            />
          </div>
        </Field>

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

        <Field label="Mật khẩu" htmlFor="password" required hint="Ít nhất 6 ký tự.">
          <div className="relative">
            <KeyRound
              className="text-ink-400 pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="pl-10"
            />
          </div>
        </Field>

        <fieldset>
          <legend className="text-ink-200 mb-2 text-xs font-medium tracking-wide">
            Bạn tham gia với vai trò
          </legend>

          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceTile
              name="role"
              value="student"
              selected={role === 'student'}
              onSelect={() => setRole('student')}
              title="Học sinh"
              description={ROLE_DESCRIPTIONS.student}
            />
            <ChoiceTile
              name="role"
              value="teacher"
              selected={role === 'teacher'}
              onSelect={() => setRole('teacher')}
              title="Giáo viên"
              description={ROLE_DESCRIPTIONS.teacher}
              tone="spark"
            />
          </div>
        </fieldset>

        {role === 'teacher' ? (
          <Field label="Trường / tổ chức" htmlFor="school" hint="Không bắt buộc">
            <div className="relative">
              <School
                className="text-ink-400 pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                id="school"
                value={school}
                onChange={(event) => setSchool(event.target.value)}
                placeholder="THCS Nguyễn Du"
                className="pl-10"
              />
            </div>
          </Field>
        ) : null}

        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {role === 'teacher' ? (
            <GraduationCap className="size-4" aria-hidden />
          ) : null}
          Tạo tài khoản
        </Button>

        <p className="text-ink-500 text-xs leading-relaxed">
          Bằng việc tạo tài khoản, bạn đồng ý để Easy Quiz lưu điểm số và tên hiển thị của bạn
          cho mục đích xếp hạng.
        </p>
      </form>
    </AuthShell>
  )
}
