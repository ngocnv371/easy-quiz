import { useEffect, useState, type FormEvent } from 'react'
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
  const {
    signUp,
    upgradeGuest,
    user,
    status,
    isConfigured,
    isGuest,
    displayName: currentName,
  } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<SignUpRole>('student')
  const [school, setSchool] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  // A guest already picked a name when they started playing — offer it back.
  useEffect(() => {
    if (isGuest && !nameTouched && currentName) setDisplayName(currentName)
  }, [isGuest, nameTouched, currentName])

  // A guest is signed in, but they belong on this page: it is where their
  // scores stop being disposable. Only a real account gets redirected away.
  if (isConfigured && status === 'ready' && user && !isGuest && !needsConfirmation) {
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
      // Both actions take the same input and return the same shape. The only
      // difference: a guest's account is converted in place, so the profile and
      // every attempt already recorded survive.
      const action = isGuest ? upgradeGuest : signUp
      const { needsEmailConfirmation } = await action({
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
        description={
          isGuest
            ? 'Chúng tôi đã gửi một liên kết xác nhận. Điểm số của bạn vẫn được giữ nguyên trong lúc chờ — bấm vào liên kết để hoàn tất.'
            : 'Chúng tôi đã gửi một liên kết xác nhận. Bấm vào đó để kích hoạt tài khoản, rồi quay lại đăng nhập.'
        }
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
      title={isGuest ? 'Lưu kết quả của bạn' : 'Tạo tài khoản Easy Quiz'}
      description={
        isGuest
          ? 'Thêm email và mật khẩu để giữ lại toàn bộ điểm số, lịch sử chơi và thứ hạng bạn đã có. Mọi thứ được chuyển sang tài khoản mới — không mất gì cả.'
          : 'Miễn phí, không cần thẻ. Bạn có thể bắt đầu với vai trò học sinh và nâng lên giáo viên bất cứ lúc nào.'
      }
      footer={
        isGuest ? (
          <>
            Đã có tài khoản khác?{' '}
            <Link to="/login" className="text-neon-300 font-medium hover:underline">
              Đăng nhập
            </Link>{' '}
            — phiên khách này sẽ bị thay thế.
          </>
        ) : (
          <>
            Đã có tài khoản?{' '}
            <Link to="/login" className="text-neon-300 font-medium hover:underline">
              Đăng nhập
            </Link>
          </>
        )
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
              onChange={(event) => {
                setNameTouched(true)
                setDisplayName(event.target.value)
              }}
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
          {role === 'teacher' ? <GraduationCap className="size-4" aria-hidden /> : null}
          {isGuest ? 'Lưu kết quả' : 'Tạo tài khoản'}
        </Button>

        <p className="text-ink-500 text-xs leading-relaxed">
          {isGuest
            ? 'Tài khoản của bạn giữ nguyên mã người chơi, nên bảng xếp hạng và lịch sử chơi không thay đổi. Bạn vẫn có thể đổi tên hiển thị sau trong trang tài khoản.'
            : 'Bằng việc tạo tài khoản, bạn đồng ý để Easy Quiz lưu điểm số và tên hiển thị của bạn cho mục đích xếp hạng.'}
        </p>
      </form>
    </AuthShell>
  )
}
