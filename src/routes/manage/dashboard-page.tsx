import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3,
  CheckCircle2,
  Coins,
  FileEdit,
  PlusCircle,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { fetchAttemptsForOwner, fetchMyQuizzes, summariseQuizzes } from '@/features/manage/api'
import { useAuth } from '@/features/auth/auth-context'
import { formatCompact, formatPercent, formatRelative } from '@/lib/format'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAsyncData } from '@/lib/use-async-data'

export function ManageDashboardPage() {
  const { user, profile, displayName, isConfigured } = useAuth()
  const credits = profile?.ai_credits ?? 0

  const quizzes = useAsyncData(
    `manage:quizzes:${user?.id ?? 'none'}`,
    () => fetchMyQuizzes(user!.id),
    Boolean(user?.id) && isConfigured,
  )

  const list = useMemo(() => quizzes.data ?? [], [quizzes.data])
  const quizIds = useMemo(() => list.map((quiz) => quiz.id), [list])
  const stats = useMemo(() => summariseQuizzes(list), [list])

  const attempts = useAsyncData(
    `manage:attempts:${quizIds.join(',')}`,
    () => fetchAttemptsForOwner(quizIds, 12),
    quizIds.length > 0,
  )

  if (!isSupabaseConfigured) {
    return (
      <div className="p-6 lg:p-10">
        <Alert tone="warning" title="Chưa kết nối Supabase">
          Cấu hình <code>.env.local</code> rồi chạy <code>npm run supabase:start</code> để dùng
          trang quản lý.
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-10">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="spark" icon={Sparkles}>
              Không gian giáo viên
            </Badge>

            <Badge tone={credits > 0 ? 'violet' : 'wrong'} icon={Coins}>
              {credits > 0 ? `Còn ${credits} credit AI` : 'Hết credit AI'}
            </Badge>
          </div>

          <h1 className="font-display mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
            Xin chào, <span className="text-gradient-spark">{displayName}</span>
          </h1>

          <p className="text-ink-300 mt-2 max-w-xl text-sm leading-relaxed">
            Đây là nơi bạn soạn đề, theo dõi lượt chơi và xem học sinh đang làm tốt ở đâu.
          </p>
        </div>

        <ButtonLink to="/manage/quizzes/new" size="lg">
          <PlusCircle className="size-4" aria-hidden />
          Tạo đề mới
        </ButtonLink>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────── */}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tổng số đề"
          value={stats.quizCount}
          icon={BarChart3}
          loading={quizzes.loading}
        />
        <StatCard
          label="Đã xuất bản"
          value={stats.publishedCount}
          icon={CheckCircle2}
          tone="correct"
          loading={quizzes.loading}
        />
        <StatCard
          label="Bản nháp"
          value={stats.draftCount}
          icon={FileEdit}
          tone="spark"
          loading={quizzes.loading}
        />
        <StatCard
          label="Tổng lượt chơi"
          value={stats.totalAttempts}
          icon={Users}
          tone="violet"
          loading={quizzes.loading}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* ── Recent activity ────────────────────────────────────── */}
        <Card className="overflow-hidden">
          <div className="border-ink-600/60 flex items-center justify-between border-b px-5 py-4">
            <h2 className="text-ink-50 inline-flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="size-4 text-neon-400" aria-hidden />
              Lượt chơi gần đây
            </h2>
          </div>

          {attempts.loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : (attempts.data ?? []).length === 0 ? (
            <p className="text-ink-400 p-5 text-sm leading-relaxed">
              Chưa có ai làm bài. Xuất bản một đề và chia sẻ liên kết cho học sinh nhé.
            </p>
          ) : (
            <ul className="divide-ink-600/60 max-h-96 divide-y overflow-y-auto">
              {(attempts.data ?? []).map((entry) => (
                <li key={entry.attempt_id} className="flex items-center gap-3 px-5 py-3">
                  <span aria-hidden>{entry.avatar_emoji}</span>

                  <div className="min-w-0 flex-1">
                    <p className="text-ink-100 truncate text-sm">{entry.display_name}</p>
                    <p className="text-ink-400 truncate text-xs">
                      {entry.quiz_title} · {formatRelative(entry.completed_at)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-ink-50 text-sm font-semibold tabular-nums">
                      {entry.score}/{entry.max_score}
                    </p>
                    <p className="text-ink-400 text-xs tabular-nums">
                      {formatPercent(entry.accuracy)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── Your quizzes ───────────────────────────────────────── */}
        <Card className="overflow-hidden">
          <div className="border-ink-600/60 flex items-center justify-between border-b px-5 py-4">
            <h2 className="text-ink-50 text-sm font-semibold">Đề thi của bạn</h2>
            <Link
              to="/manage/quizzes"
              className="text-neon-300 hover:text-neon-200 text-xs transition-colors"
            >
              Xem tất cả
            </Link>
          </div>

          {quizzes.loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={PlusCircle}
                title="Chưa có đề thi nào"
                description="Tạo đề đầu tiên — hoặc để AI Assist soạn giúp bạn 10 câu trong vài giây."
                action={
                  <ButtonLink to="/manage/quizzes/new" size="sm">
                    Tạo đề mới
                  </ButtonLink>
                }
                className="border-0 bg-transparent py-8"
              />
            </div>
          ) : (
            <ul className="divide-ink-600/60 divide-y">
              {list.slice(0, 6).map((quiz) => (
                <li key={quiz.id} className="flex items-center">
                  <Link
                    to={`/manage/quizzes/${quiz.id}`}
                    className="hover:bg-ink-800/40 flex min-w-0 flex-1 items-center gap-3 px-5 py-3.5 transition-colors"
                  >
                    <span aria-hidden>{quiz.cover_emoji}</span>

                    <div className="min-w-0 flex-1">
                      <p className="text-ink-100 truncate text-sm font-medium">{quiz.title}</p>
                      <p className="text-ink-400 text-xs">
                        {quiz.question_count} câu · {formatCompact(quiz.play_count)} lượt chơi
                      </p>
                    </div>

                    <Badge tone={quiz.status === 'published' ? 'correct' : 'neutral'}>
                      {quiz.status === 'published' ? 'Đã đăng' : quiz.status === 'draft' ? 'Nháp' : 'Lưu trữ'}
                    </Badge>
                  </Link>

                  <Link
                    to={`/manage/quizzes/${quiz.id}/report`}
                    aria-label={`Thống kê ${quiz.title}`}
                    title="Thống kê"
                    className="text-ink-400 hover:text-neon-300 mr-3 shrink-0 rounded-lg p-2 transition-colors"
                  >
                    <BarChart3 className="size-4" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'neon',
  loading,
}: {
  label: string
  value: number
  icon: typeof BarChart3
  tone?: 'neon' | 'spark' | 'correct' | 'violet'
  loading?: boolean
}) {
  const tones = {
    neon: 'border-neon-400/40 bg-neon-400/10 text-neon-300',
    spark: 'border-spark-400/40 bg-spark-400/10 text-spark-300',
    correct: 'border-correct-400/40 bg-correct-500/10 text-correct-300',
    violet: 'border-violet-glow-400/40 bg-violet-glow-500/10 text-violet-glow-300',
  } as const

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-ink-400 text-xs font-medium uppercase tracking-[0.16em]">{label}</p>
        <span
          className={`flex size-8 items-center justify-center rounded-lg border ${tones[tone]}`}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      </div>

      {loading ? (
        <Skeleton className="mt-3 h-8 w-16" />
      ) : (
        <p className="font-display text-ink-50 mt-2 text-2xl font-semibold tabular-nums">
          {formatCompact(value)}
        </p>
      )}
    </Card>
  )
}
