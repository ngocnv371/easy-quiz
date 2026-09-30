import { Link, useParams } from 'react-router-dom'
import { Trophy, UserX } from 'lucide-react'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card, Stat } from '@/components/ui/card'
import { EmptyState, Skeleton } from '@/components/ui/feedback'
import { fetchGlobalLeaderboard, fetchMyAttempts } from '@/features/quiz/api'
import { formatCompact, formatPercent, formatRelative, medalFor } from '@/lib/format'
import { ROLE_LABELS } from '@/lib/labels'
import { asRole, type ProfileRow } from '@/lib/domain'
import { usePageMeta } from '@/lib/seo'
import { requireSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'
import { useAsyncData } from '@/lib/use-async-data'

async function fetchProfileByUsername(username: string): Promise<ProfileRow | null> {
  const supabase = requireSupabase()

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .maybeSingle()

  if (error) throw new Error(errorMessage(error))
  return data ?? null
}

/** Public profile at `/u/:username`. */
export function ProfilePage() {
  const { username = '' } = useParams()

  const profile = useAsyncData(
    `profile:${username}`,
    () => fetchProfileByUsername(username),
    isSupabaseConfigured && username !== '',
  )

  const attempts = useAsyncData(
    `profile-attempts:${profile.data?.id ?? 'none'}`,
    () => fetchMyAttempts(profile.data!.id, 12),
    Boolean(profile.data?.id),
  )

  const board = useAsyncData(
    'profile-board',
    () => fetchGlobalLeaderboard(100),
    Boolean(profile.data?.id),
  )

  const rank = (() => {
    const index = (board.data ?? []).findIndex((entry) => entry.user_id === profile.data?.id)
    return index >= 0
      ? { position: index + 1, total: board.data?.length ?? 0, row: (board.data ?? [])[index]! }
      : null
  })()

  usePageMeta({
    title: profile.data?.display_name ?? 'Hồ sơ người học',
    description: profile.data
      ? (profile.data.bio ??
        `Hồ sơ học tập của ${profile.data.display_name} trên Easy Quiz — điểm số, chuỗi ngày học và thứ hạng.`)
      : undefined,
    path: `/u/${username}`,
    // A username that does not resolve should not be indexed.
    noIndex: !profile.loading && !profile.data,
  })

  if (profile.loading) {
    return (
      <Shell>
        <Card className="p-8">
          <div className="flex items-center gap-5">
            <Skeleton className="size-16 rounded-2xl" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </Card>
      </Shell>
    )
  }

  if (!profile.data) {
    return (
      <Shell>
        <EmptyState
          icon={UserX}
          title="Không tìm thấy người chơi này"
          description={`Không có hồ sơ nào với tên đăng nhập "${username}".`}
          action={<ButtonLink to="/leaderboard">Xem bảng xếp hạng</ButtonLink>}
        />
      </Shell>
    )
  }

  const person = profile.data
  const role = asRole(person.role)

  return (
    <Shell>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="p-6 sm:p-7">
            <div className="flex flex-wrap items-start gap-5">
              <span
                className="border-ink-600 bg-ink-800/70 flex size-16 items-center justify-center rounded-2xl border text-3xl"
                aria-hidden
              >
                {person.avatar_emoji}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-ink-50 text-xl font-semibold tracking-tight sm:text-2xl">
                    {person.display_name}
                  </h1>
                  <Badge tone={role === 'teacher' || role === 'admin' ? 'spark' : 'neon'}>
                    {ROLE_LABELS[role]}
                  </Badge>
                  {person.is_guest ? <Badge tone="neutral">Khách</Badge> : null}
                </div>

                <p className="text-ink-400 mt-1 text-sm">@{person.username}</p>

                {person.school ? (
                  <p className="text-ink-300 mt-2 text-sm">{person.school}</p>
                ) : null}

                {person.bio ? (
                  <p className="text-ink-300 mt-3 text-sm leading-relaxed">{person.bio}</p>
                ) : null}
              </div>
            </div>

            {rank ? (
              <dl className="border-ink-600/60 mt-7 grid grid-cols-2 gap-6 border-t pt-6 sm:grid-cols-4">
                <Stat
                  label="Tổng điểm"
                  value={formatCompact(rank.row.total_score)}
                  hint={`${rank.row.attempt_count} lượt chơi`}
                />
                <Stat
                  label="Xếp hạng"
                  value={medalFor(rank.position) || `#${rank.position}`}
                  hint={`trong ${rank.total} người`}
                />
                <Stat label="Đề đã làm" value={rank.row.quiz_count} />
                <Stat label="Độ chính xác" value={formatPercent(rank.row.avg_accuracy)} />
              </dl>
            ) : null}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-ink-600/60 border-b px-5 py-4">
              <h2 className="text-ink-50 text-sm font-semibold">Lượt chơi gần đây</h2>
            </div>

            {(attempts.data ?? []).length === 0 ? (
              <p className="text-ink-400 p-5 text-sm">Chưa có lượt chơi nào được ghi lại.</p>
            ) : (
              <ul className="divide-ink-600/60 divide-y">
                {(attempts.data ?? []).map((entry) => (
                  <li key={entry.attempt_id} className="flex items-center gap-3 px-5 py-3">
                    <span aria-hidden>{entry.cover_emoji}</span>

                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/q/${entry.quiz_slug}`}
                        className="text-ink-100 hover:text-neon-300 truncate text-sm transition-colors"
                      >
                        {entry.quiz_title}
                      </Link>
                      <p className="text-ink-400 text-xs">
                        {formatRelative(entry.completed_at)} · {formatPercent(entry.accuracy)}
                      </p>
                    </div>

                    <span className="text-ink-50 text-sm font-semibold tabular-nums">
                      {entry.score}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div>
          <Card className="border-spark-400/30 p-6">
            <p className="text-spark-300 inline-flex items-center gap-2 text-sm font-semibold">
              <Trophy className="size-4" aria-hidden />
              Thách đấu
            </p>
            <p className="text-ink-300 mt-2 text-sm leading-relaxed">
              Nghĩ mình làm nhanh hơn {person.display_name}? Chọn một đề và thử xem.
            </p>
            <ButtonLink to="/explore" size="sm" className="mt-4">
              Khám phá đề thi
            </ButtonLink>
          </Card>
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <AuroraBackground />

      <div className="container-page relative py-12">
        <Link
          to="/leaderboard"
          className="text-ink-400 hover:text-neon-300 mb-6 inline-flex items-center gap-2 text-sm transition-colors"
        >
          ← Bảng xếp hạng
        </Link>

        {children}
      </div>
    </div>
  )
}
