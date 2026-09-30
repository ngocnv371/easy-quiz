import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, Coins, Save, Sparkles, Trophy } from 'lucide-react'
import { toast } from 'sonner'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, Stat } from '@/components/ui/card'
import { EmojiPicker } from '@/components/ui/emoji-picker'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Field, Input, Textarea } from '@/components/ui/field'
import { fetchMyAttempts, fetchGlobalLeaderboard } from '@/features/quiz/api'
import { useAuth } from '@/features/auth/auth-context'
import { formatCompact, formatPercent, formatRelative, medalFor } from '@/lib/format'
import { AVATAR_EMOJIS, ROLE_LABELS } from '@/lib/labels'
import { usePageMeta } from '@/lib/seo'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAsyncData } from '@/lib/use-async-data'
import { errorMessage } from '@/lib/utils'

export function AccountPage() {
  const {
    user,
    profile,
    displayName,
    isGuest,
    isTeacher,
    role,
    updateProfile,
    signOut,
    refreshProfile,
  } = useAuth()
  const navigate = useNavigate()
  const credits = profile?.ai_credits ?? 0

  // Behind auth and entirely personal — keep it out of the index.
  usePageMeta({ title: 'Tài khoản của tôi', noIndex: true, path: '/account' })

  const [name, setName] = useState(displayName)
  const [avatar, setAvatar] = useState(profile?.avatar_emoji ?? '🎓')
  const [school, setSchool] = useState(profile?.school ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep the form in step if the profile loads after the first render.
  useEffect(() => {
    if (!profile) return
    setName(profile.display_name)
    setAvatar(profile.avatar_emoji)
    setSchool(profile.school ?? '')
    setBio(profile.bio ?? '')
  }, [profile])

  const attempts = useAsyncData(
    `account:attempts:${user?.id ?? 'none'}`,
    () => fetchMyAttempts(user!.id, 20),
    Boolean(user?.id) && isSupabaseConfigured,
  )

  const board = useAsyncData(
    'account:board',
    () => fetchGlobalLeaderboard(100),
    Boolean(user?.id) && isSupabaseConfigured,
  )

  const myRank = (() => {
    const list = board.data ?? []
    const index = list.findIndex((entry) => entry.user_id === user?.id)
    return index >= 0 ? { position: index + 1, total: list.length, row: list[index]! } : null
  })()

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (name.trim().length < 2) {
      setError('Tên hiển thị cần ít nhất 2 ký tự.')
      return
    }

    setSaving(true)

    try {
      await updateProfile({
        display_name: name.trim().slice(0, 60),
        avatar_emoji: avatar,
        school: school.trim() === '' ? null : school.trim(),
        bio: bio.trim() === '' ? null : bio.trim().slice(0, 280),
      })

      await refreshProfile()
      toast.success('Đã lưu hồ sơ.')
    } catch (saveError) {
      const message = errorMessage(saveError)
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  if (!isSupabaseConfigured) {
    return (
      <Shell>
        <EmptyState
          icon={Trophy}
          title="Chưa kết nối Supabase"
          description="Hồ sơ cần máy chủ. Hãy cấu hình .env.local trước."
        />
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* ── Profile form ─────────────────────────────────────────── */}
        <div className="space-y-6">
          <Card className="p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-ink-50 text-xl font-semibold tracking-tight">
                  Hồ sơ của bạn
                </h1>
                <p className="text-ink-400 mt-1 text-sm">
                  {profile?.username ?? '—'} · {ROLE_LABELS[role]}
                </p>
              </div>

              <Badge tone={role === 'teacher' || role === 'admin' ? 'spark' : 'neon'}>
                {ROLE_LABELS[role]}
              </Badge>
            </div>

            {isGuest ? (
              <Alert tone="warning" icon={Sparkles} title="Bạn đang chơi với tư cách khách" className="mt-5">
                Thành tích đã có vẫn được giữ. Tạo tài khoản chính thức để đăng nhập lại trên
                thiết bị khác và không mất hồ sơ.
                <div className="mt-3">
                  <ButtonLink to="/register" size="sm" variant="spark">
                    Tạo tài khoản
                  </ButtonLink>
                </div>
              </Alert>
            ) : null}

            {error ? (
              <Alert tone="error" className="mt-5">
                {error}
              </Alert>
            ) : null}

            <form onSubmit={handleSave} className="mt-6 space-y-5" noValidate>
              <Field label="Tên hiển thị" htmlFor="profile-name" required>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={60}
                />
              </Field>

              <EmojiPicker
                label="Ảnh đại diện"
                value={avatar}
                onChange={setAvatar}
                options={AVATAR_EMOJIS}
              />

              <Field label="Trường / tổ chức" htmlFor="profile-school" hint="Không bắt buộc">
                <Input
                  id="profile-school"
                  value={school}
                  onChange={(event) => setSchool(event.target.value)}
                  placeholder="THCS Nguyễn Du"
                />
              </Field>

              <Field
                label="Giới thiệu ngắn"
                htmlFor="profile-bio"
                hint={`${bio.length}/280 ký tự`}
              >
                <Textarea
                  id="profile-bio"
                  rows={3}
                  value={bio}
                  onChange={(event) => setBio(event.target.value.slice(0, 280))}
                  placeholder="Mình thích Toán và Lịch sử…"
                />
              </Field>

              <div className="flex flex-wrap gap-3">
                <Button type="submit" loading={saving}>
                  {saving ? null : <Save className="size-4" aria-hidden />}
                  Lưu thay đổi
                </Button>

                <Button type="button" variant="ghost" onClick={() => void handleSignOut()}>
                  <LogOut className="size-4" aria-hidden />
                  Đăng xuất
                </Button>
              </div>
            </form>
          </Card>

          {isTeacher ? (
            <Card className="p-6 sm:p-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-ink-50 inline-flex items-center gap-2 text-lg font-semibold tracking-tight">
                    <Coins className="text-spark-300 size-4" aria-hidden />
                    Credit AI Assist
                  </h2>
                  <p className="text-ink-400 mt-2 text-sm leading-relaxed">
                    Mỗi lần soạn đề bằng AI tiêu tốn một credit. Số dư hiện tại của bạn:
                  </p>
                </div>

                <span className="font-display text-spark-300 text-3xl font-semibold tabular-nums">
                  {credits}
                </span>
              </div>

              {credits <= 0 ? (
                <Alert tone="warning" className="mt-4">
                  Bạn đã dùng hết credit. Việc nạp credit sẽ sớm được mở; trong lúc chờ, hãy liên hệ
                  quản trị viên để được cấp thêm.
                </Alert>
              ) : null}
            </Card>
          ) : null}
        </div>

        {/* ── Stats + history ──────────────────────────────────────── */}
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-ink-50 text-sm font-semibold">Thành tích</h2>

            {board.loading ? (
              <div className="mt-4 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : myRank ? (
              <>
                <dl className="mt-5 grid grid-cols-2 gap-5">
                  <Stat
                    label="Tổng điểm"
                    value={formatCompact(myRank.row.total_score)}
                    hint={`${myRank.row.attempt_count} lượt chơi`}
                  />
                  <Stat
                    label="Xếp hạng"
                    value={medalFor(myRank.position) || `#${myRank.position}`}
                    hint={`trong ${myRank.total} người`}
                  />
                  <Stat label="Đề đã làm" value={myRank.row.quiz_count} />
                  <Stat
                    label="Độ chính xác"
                    value={formatPercent(myRank.row.avg_accuracy)}
                  />
                </dl>

                <Link
                  to="/leaderboard"
                  className="text-neon-300 hover:text-neon-200 mt-5 inline-flex items-center gap-1.5 text-sm transition-colors"
                >
                  <Trophy className="size-3.5" aria-hidden />
                  Xem bảng xếp hạng
                </Link>
              </>
            ) : (
              <p className="text-ink-400 mt-3 text-sm leading-relaxed">
                Bạn chưa hoàn thành đề nào. Làm một đề và thành tích sẽ xuất hiện ở đây.
              </p>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-ink-600/60 border-b px-5 py-4">
              <h2 className="text-ink-50 text-sm font-semibold">Lịch sử gần đây</h2>
            </div>

            {attempts.loading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : (attempts.data ?? []).length === 0 ? (
              <p className="text-ink-400 p-5 text-sm">
                Chưa có lượt chơi nào.{' '}
                <Link to="/explore" className="text-neon-300 hover:underline">
                  Bắt đầu ngay
                </Link>
              </p>
            ) : (
              <ul className="divide-ink-600/60 divide-y">
                {(attempts.data ?? []).map((entry) => (
                  <li key={entry.attempt_id}>
                    <Link
                      to={`/q/${entry.quiz_slug}/result/${entry.attempt_id}`}
                      className="hover:bg-ink-800/40 flex items-center gap-3 px-5 py-3 transition-colors"
                    >
                      <span aria-hidden>{entry.cover_emoji}</span>

                      <div className="min-w-0 flex-1">
                        <p className="text-ink-100 truncate text-sm">{entry.quiz_title}</p>
                        <p className="text-ink-400 text-xs">
                          {formatRelative(entry.completed_at)} ·{' '}
                          {formatPercent(entry.accuracy)}
                        </p>
                      </div>

                      <span className="text-ink-50 text-sm font-semibold tabular-nums">
                        {entry.score}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <AuroraBackground variant="quiz" />

      <main id="main-content" className="container-page relative py-12">
        <Link
          to="/"
          className="text-ink-400 hover:text-neon-300 mb-6 inline-flex items-center gap-2 text-sm transition-colors"
        >
          ← Về trang chủ
        </Link>

        {children}
      </main>
    </div>
  )
}
