import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Crown, Target, Trophy, Users } from 'lucide-react'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState, Skeleton } from '@/components/ui/feedback'
import { Select } from '@/components/ui/field'
import { Reveal } from '@/components/ui/reveal'
import {
  fetchGlobalLeaderboard,
  fetchQuizCards,
  fetchQuizLeaderboard,
} from '@/features/quiz/api'
import { formatCompact, formatPercent, formatRelative, medalFor } from '@/lib/format'
import type { LeaderboardEntry } from '@/lib/domain'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAsyncData } from '@/lib/use-async-data'
import { cn } from '@/lib/utils'

export function LeaderboardPage() {
  const [params, setParams] = useSearchParams()
  const quizSlug = params.get('quiz')

  const global = useAsyncData(
    'leaderboard:global',
    () => fetchGlobalLeaderboard(50),
    isSupabaseConfigured && !quizSlug,
  )

  const quizzes = useAsyncData(
    'leaderboard:quizzes',
    () => fetchQuizCards({ sort: 'popular', limit: 40 }),
    isSupabaseConfigured,
  )

  const selectedQuiz = useMemo(
    () => (quizzes.data ?? []).find((quiz) => quiz.slug === quizSlug) ?? null,
    [quizzes.data, quizSlug],
  )

  const perQuiz = useAsyncData(
    `leaderboard:quiz:${selectedQuiz?.id ?? 'none'}`,
    () => fetchQuizLeaderboard(selectedQuiz!.id, 30),
    isSupabaseConfigured && Boolean(selectedQuiz),
  )

  const setQuiz = (slug: string | null) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (slug) next.set('quiz', slug)
      else next.delete('quiz')
      return next
    })
  }

  return (
    <div className="relative">
      <AuroraBackground />

      <div className="container-page relative py-14">
        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="max-w-2xl">
          <Badge tone="spark" icon={Trophy}>
            Bảng xếp hạng
          </Badge>

          <h1 className="font-display mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
            Ai đang dẫn đầu <span className="text-gradient-spark">tuần này</span>?
          </h1>

          <p className="text-ink-300 mt-3 text-base leading-relaxed">
            Mỗi lượt hoàn thành đều được máy chủ chấm điểm và ghi vào bảng. Điểm được cộng dồn
            theo độ chính xác và độ khó của đề.
          </p>
        </div>

        {/* ── Mode switch ──────────────────────────────────────────── */}
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="border-ink-600 bg-ink-800/60 inline-flex rounded-full border p-1"
            role="tablist"
            aria-label="Kiểu bảng xếp hạng"
          >
            <ModeTab
              active={!quizSlug}
              onClick={() => setQuiz(null)}
              icon={Crown}
              label="Bảng vàng"
            />
            <ModeTab
              active={Boolean(quizSlug)}
              onClick={() => {
                const first = quizzes.data?.[0]
                setQuiz(first?.slug ?? null)
              }}
              icon={Target}
              label="Theo đề thi"
            />
          </div>

          {quizSlug ? (
            <Select
              value={quizSlug}
              onChange={(event) => setQuiz(event.target.value || null)}
              aria-label="Chọn đề thi"
              className="sm:w-80"
            >
              {(quizzes.data ?? []).map((quiz) => (
                <option key={quiz.id} value={quiz.slug}>
                  {quiz.cover_emoji} {quiz.title}
                </option>
              ))}
            </Select>
          ) : null}
        </div>

        {/* ── Body ─────────────────────────────────────────────────── */}
        <div className="mt-10">
          {!isSupabaseConfigured ? (
            <EmptyState
              icon={Trophy}
              title="Chưa kết nối Supabase"
              description="Bảng xếp hạng cần dữ liệu thật. Hãy cấu hình .env.local và chạy npm run supabase:start."
            />
          ) : quizSlug ? (
            <PerQuizBoard
              loading={perQuiz.loading}
              error={perQuiz.error}
              entries={perQuiz.data ?? []}
              quizTitle={selectedQuiz?.title ?? ''}
            />
          ) : (
            <GlobalBoard
              loading={global.loading}
              error={global.error}
              entries={global.data ?? []}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Crown
  label: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200',
        active ? 'bg-ink-700 text-ink-50' : 'text-ink-400 hover:text-ink-100',
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  )
}

// ── Global board ───────────────────────────────────────────────────────────
function GlobalBoard({
  loading,
  error,
  entries,
}: {
  loading: boolean
  error: string | null
  entries: Awaited<ReturnType<typeof fetchGlobalLeaderboard>>
}) {
  if (loading) return <BoardSkeleton />
  if (error) return <EmptyState icon={Trophy} title="Không tải được bảng xếp hạng" description={error} />
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Chưa có ai lên bảng"
        description="Hãy là người đầu tiên. Hoàn thành một đề thi là tên bạn xuất hiện ở đây."
      />
    )
  }

  const podium = entries.slice(0, 3)
  const rest = entries.slice(3)

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        {podium.map((entry, index) => (
          <Reveal key={entry.user_id} delay={index * 0.08}>
            <Card
              className={cn(
                'p-5 text-center',
                index === 0 && 'border-spark-400/40 shadow-glow-spark',
              )}
            >
              <p className="text-3xl" aria-hidden>
                {medalFor(index + 1)}
              </p>
              <p className="mt-2 text-3xl" aria-hidden>
                {entry.avatar_emoji}
              </p>

              <p className="font-display text-ink-50 mt-2 truncate text-base font-semibold">
                {entry.username ? (
                  <Link to={`/u/${entry.username}`} className="hover:text-neon-300 transition-colors">
                    {entry.display_name}
                  </Link>
                ) : (
                  entry.display_name
                )}
              </p>

              <p className="font-display text-gradient-spark mt-1 text-2xl font-bold tabular-nums">
                {formatCompact(entry.total_score)}
              </p>

              <p className="text-ink-400 mt-1 text-xs">
                {entry.quiz_count} đề · {formatPercent(entry.avg_accuracy)} chính xác
              </p>
            </Card>
          </Reveal>
        ))}
      </div>

      {rest.length > 0 ? (
        <Card className="overflow-hidden">
          <ul className="divide-ink-600/60 divide-y">
            {rest.map((entry, index) => (
              <li
                key={entry.user_id}
                className="hover:bg-ink-800/40 flex items-center gap-4 px-5 py-3.5 transition-colors"
              >
                <span className="text-ink-400 w-8 text-sm tabular-nums">{index + 4}</span>
                <span className="text-lg" aria-hidden>
                  {entry.avatar_emoji}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-ink-100 truncate text-sm font-medium">
                    {entry.username ? (
                      <Link
                        to={`/u/${entry.username}`}
                        className="hover:text-neon-300 transition-colors"
                      >
                        {entry.display_name}
                      </Link>
                    ) : (
                      entry.display_name
                    )}
                  </p>
                  <p className="text-ink-400 text-xs">
                    {entry.attempt_count} lượt · {entry.quiz_count} đề
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-ink-50 text-sm font-semibold tabular-nums">
                    {formatCompact(entry.total_score)}
                  </p>
                  <p className="text-ink-400 text-xs tabular-nums">
                    {formatPercent(entry.avg_accuracy)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}

// ── Per-quiz board ─────────────────────────────────────────────────────────
function PerQuizBoard({
  loading,
  error,
  entries,
  quizTitle,
}: {
  loading: boolean
  error: string | null
  entries: LeaderboardEntry[]
  quizTitle: string
}) {
  if (loading) return <BoardSkeleton />
  if (error) return <EmptyState icon={Trophy} title="Không tải được bảng xếp hạng" description={error} />

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title={`Chưa ai hoàn thành "${quizTitle}"`}
        description="Hãy là người mở màn. Điểm của bạn sẽ là kỷ lục đầu tiên của đề thi này."
      />
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-ink-600/60 flex items-center justify-between border-b px-5 py-4">
        <p className="text-ink-100 font-medium">{quizTitle}</p>
        <Badge tone="neutral">{entries.length} lượt</Badge>
      </div>

      <ul className="divide-ink-600/60 divide-y">
        {entries.map((entry, index) => (
          <li
            key={entry.attempt_id}
            className="hover:bg-ink-800/40 flex items-center gap-4 px-5 py-3.5 transition-colors"
          >
            <span className="w-8 text-sm tabular-nums">
              {medalFor(index + 1) || <span className="text-ink-400">{index + 1}</span>}
            </span>

            <span className="text-lg" aria-hidden>
              {entry.avatar_emoji}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-ink-100 truncate text-sm font-medium">
                {entry.username ? (
                  <Link to={`/u/${entry.username}`} className="hover:text-neon-300 transition-colors">
                    {entry.display_name}
                  </Link>
                ) : (
                  entry.display_name
                )}
              </p>
              <p className="text-ink-400 text-xs">
                {formatRelative(entry.completed_at)}
                {entry.is_guest ? ' · khách' : ''}
              </p>
            </div>

            <div className="hidden text-right sm:block">
              <p className="text-ink-300 text-xs tabular-nums">
                {entry.correct_count}/{entry.question_count} câu
              </p>
              <p className="text-ink-500 text-xs tabular-nums">
                {formatPercent(entry.accuracy)}
              </p>
            </div>

            <p className="text-spark-300 w-16 text-right text-sm font-semibold tabular-nums">
              {entry.score}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function BoardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index} className="p-5">
            <Skeleton className="mx-auto size-10 rounded-full" />
            <Skeleton className="mx-auto mt-3 h-4 w-24" />
            <Skeleton className="mx-auto mt-2 h-7 w-16" />
          </Card>
        ))}
      </div>

      <Card className="p-5">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-4 py-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </Card>
    </div>
  )
}
