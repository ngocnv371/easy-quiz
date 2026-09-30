import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  LineChart,
  Minus,
  RotateCcw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card, Stat } from '@/components/ui/card'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Reveal } from '@/components/ui/reveal'
import { useAuth } from '@/features/auth/auth-context'
import { fetchMyAttempts } from '@/features/quiz/api'
import {
  buildProgressReport,
  MASTERY_LABELS,
  MASTERED_ACCURACY,
  NEEDS_PRACTICE_ACCURACY,
  type MasteryLevel,
  type QuizProgress,
} from '@/features/quiz/progress'
import { formatCompact, formatPercent, formatRelative } from '@/lib/format'
import { usePageMeta } from '@/lib/seo'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAsyncData } from '@/lib/use-async-data'
import { cn } from '@/lib/utils'

const MASTERY_TONES: Record<MasteryLevel, BadgeTone> = {
  mastered: 'correct',
  developing: 'neon',
  'needs-practice': 'wrong',
}

/**
 * The student's own progress screen: how they are doing overall, which topics
 * are strong or shaky, and — the point of the page — the handful of quizzes
 * most worth retrying, each with a reason.
 *
 * Everything is pivoted from the attempts the leaderboard already exposes, so
 * there is no new query and no migration to keep in step.
 */
export function ProgressPage() {
  const { user, isGuest, displayName } = useAuth()

  // Personal and signed-in only — keep it out of the index.
  usePageMeta({
    title: 'Tiến độ học tập',
    description:
      'Điểm số, độ chính xác theo đề và chủ đề, cùng gợi ý những đề thi bạn nên luyện lại.',
    path: '/progress',
    noIndex: true,
  })

  const attempts = useAsyncData(
    `progress:attempts:${user?.id ?? 'none'}`,
    () => fetchMyAttempts(user!.id, 100),
    Boolean(user?.id) && isSupabaseConfigured,
  )

  const report = useMemo(() => buildProgressReport(attempts.data ?? []), [attempts.data])

  return (
    <div className="relative">
      <AuroraBackground />

      <div className="container-page relative py-14">
        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="max-w-2xl">
          <Badge tone="neon" icon={LineChart}>
            Tiến độ học tập
          </Badge>

          <h1 className="font-display mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
            {displayName ? `${displayName}, cùng nhìn lại` : 'Cùng nhìn lại'}{' '}
            <span className="text-gradient">chặng đường của bạn</span>
          </h1>

          <p className="text-ink-300 mt-3 text-base leading-relaxed">
            Mọi lượt chơi đều được tổng hợp theo đề và theo chủ đề. Nơi nào còn yếu, Easy Quiz
            gợi ý đúng đề bạn nên thử lại.
          </p>
        </div>

        <div className="mt-10">
          {!isSupabaseConfigured ? (
            <EmptyState
              icon={LineChart}
              title="Chưa kết nối Supabase"
              description="Trang tiến độ cần dữ liệu thật. Hãy cấu hình .env.local và chạy npm run supabase:start."
            />
          ) : attempts.loading ? (
            <ProgressSkeleton />
          ) : attempts.error ? (
            <EmptyState
              icon={LineChart}
              title="Không tải được tiến độ"
              description={attempts.error}
            />
          ) : report.totalAttempts === 0 ? (
            <EmptyState
              icon={Trophy}
              title="Chưa có lượt chơi nào"
              description="Hoàn thành một đề thi đầu tiên và trang này sẽ bắt đầu theo dõi điểm số, độ chính xác và gợi ý ôn tập cho bạn."
              action={<ButtonLink to="/explore">Khám phá đề thi</ButtonLink>}
            />
          ) : (
            <div className="space-y-8">
              {isGuest ? (
                <Alert tone="warning" icon={Sparkles} title="Bạn đang chơi với tư cách khách">
                  Tiến độ được giữ trên thiết bị này. Tạo tài khoản chính thức để đăng nhập lại
                  ở nơi khác mà không mất thành tích.
                  <div className="mt-3">
                    <ButtonLink to="/register" size="sm" variant="spark">
                      Tạo tài khoản
                    </ButtonLink>
                  </div>
                </Alert>
              ) : null}

              <OverviewCard
                totalScore={report.totalScore}
                averageAccuracy={report.averageAccuracy}
                bestAccuracy={report.bestAccuracy}
                totalAttempts={report.totalAttempts}
                quizzesPlayed={report.quizzesPlayed}
                masteredCount={report.masteredCount}
                needsPracticeCount={report.needsPracticeCount}
                lastPlayedAt={report.lastPlayedAt}
              />

              {report.suggestions.length > 0 ? (
                <SuggestionSection
                  suggestions={report.suggestions}
                />
              ) : (
                <Alert tone="success" icon={Trophy} title="Bạn đang làm rất tốt">
                  Mọi đề bạn từng chơi đều đã đạt mức thành thạo (từ{' '}
                  {formatPercent(MASTERED_ACCURACY)} trở lên). Thử sức với một đề mới để mở
                  rộng kiến thức nhé.
                  <div className="mt-3">
                    <ButtonLink to="/explore" size="sm" variant="spark">
                      Tìm đề mới
                    </ButtonLink>
                  </div>
                </Alert>
              )}

              <QuizBreakdown quizzes={report.quizzes} />

              {report.topics.length > 0 ? (
                <TopicSection topics={report.topics} />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Overview ───────────────────────────────────────────────────────────────
function OverviewCard({
  totalScore,
  averageAccuracy,
  bestAccuracy,
  totalAttempts,
  quizzesPlayed,
  masteredCount,
  needsPracticeCount,
  lastPlayedAt,
}: {
  totalScore: number
  averageAccuracy: number
  bestAccuracy: number
  totalAttempts: number
  quizzesPlayed: number
  masteredCount: number
  needsPracticeCount: number
  lastPlayedAt: string | null
}) {
  return (
    <Card className="p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-ink-50 text-sm font-semibold">Tổng quan</h2>
        {lastPlayedAt ? (
          <p className="text-ink-400 text-xs">Lượt chơi gần nhất {formatRelative(lastPlayedAt)}</p>
        ) : null}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        <Stat
          label="Tổng điểm"
          value={formatCompact(totalScore)}
          hint={`${totalAttempts} lượt chơi`}
        />
        <Stat
          label="Độ chính xác TB"
          value={formatPercent(averageAccuracy)}
          hint={`cao nhất ${formatPercent(bestAccuracy)}`}
        />
        <Stat
          label="Đề đã làm"
          value={quizzesPlayed}
          hint={`${masteredCount} đã thành thạo`}
        />
        <Stat
          label="Cần luyện thêm"
          value={needsPracticeCount}
          hint={
            needsPracticeCount === 0
              ? 'không có đề nào dưới 50%'
              : `dưới ${formatPercent(NEEDS_PRACTICE_ACCURACY)}`
          }
        />
      </dl>
    </Card>
  )
}

// ── Retry suggestions ──────────────────────────────────────────────────────
function SuggestionSection({
  suggestions,
}: {
  suggestions: ReturnType<typeof buildProgressReport>['suggestions']
}) {
  return (
    <section aria-labelledby="retry-heading">
      <div className="flex items-center gap-2">
        <RotateCcw className="text-spark-300 size-4" aria-hidden />
        <h2 id="retry-heading" className="font-display text-ink-50 text-lg font-semibold tracking-tight">
          Nên luyện lại
        </h2>
      </div>
      <p className="text-ink-400 mt-1.5 text-sm">
        Dựa trên độ chính xác, đà tiến bộ và thời gian lâu chưa luyện.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {suggestions.map((suggestion, index) => (
          <Reveal key={suggestion.quiz.quizId} delay={index * 0.06}>
            <Card className="flex h-full flex-col p-5">
              <div className="flex items-start gap-3">
                <span
                  className="border-ink-600 bg-ink-800/70 flex size-11 shrink-0 items-center justify-center rounded-xl border text-xl"
                  aria-hidden
                >
                  {suggestion.quiz.coverEmoji}
                </span>

                <div className="min-w-0 flex-1">
                  <Link
                    to={`/q/${suggestion.quiz.slug}`}
                    className="text-ink-50 hover:text-neon-300 block truncate text-sm font-semibold transition-colors"
                  >
                    {suggestion.quiz.title}
                  </Link>
                  <p className="text-ink-400 mt-0.5 text-xs">
                    {suggestion.quiz.topicName ?? 'Không có chủ đề'} ·{' '}
                    {suggestion.quiz.attemptCount} lượt
                  </p>
                </div>

                <Badge tone={MASTERY_TONES[suggestion.quiz.mastery]}>
                  {MASTERY_LABELS[suggestion.quiz.mastery]}
                </Badge>
              </div>

              <p className="text-ink-300 mt-4 text-sm leading-relaxed">{suggestion.reason}</p>

              <div className="mt-4 flex items-center gap-4">
                <div className="flex-1">
                  <AccuracyBar value={suggestion.quiz.bestAccuracy} />
                  <p className="text-ink-400 mt-1.5 text-xs">
                    Cao nhất {formatPercent(suggestion.quiz.bestAccuracy)} · Gần nhất{' '}
                    {formatPercent(suggestion.quiz.latestAccuracy)}
                  </p>
                </div>
              </div>

              <div className="mt-auto pt-5">
                <ButtonLink to={`/q/${suggestion.quiz.slug}/play`} size="sm" variant="spark">
                  <RotateCcw className="size-4" aria-hidden />
                  Luyện lại ngay
                </ButtonLink>
              </div>
            </Card>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

// ── Per-quiz breakdown ─────────────────────────────────────────────────────
function QuizBreakdown({ quizzes }: { quizzes: QuizProgress[] }) {
  return (
    <section aria-labelledby="breakdown-heading">
      <div className="flex items-center gap-2">
        <Target className="text-neon-300 size-4" aria-hidden />
        <h2
          id="breakdown-heading"
          className="font-display text-ink-50 text-lg font-semibold tracking-tight"
        >
          Theo đề thi
        </h2>
      </div>
      <p className="text-ink-400 mt-1.5 text-sm">Yếu nhất ở trên cùng.</p>

      <Card className="mt-5 overflow-hidden">
        <ul className="divide-ink-600/60 divide-y">
          {quizzes.map((quiz) => (
            <li key={quiz.quizId} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <span className="text-xl" aria-hidden>
                {quiz.coverEmoji}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/q/${quiz.slug}`}
                    className="text-ink-100 hover:text-neon-300 truncate text-sm font-medium transition-colors"
                  >
                    {quiz.title}
                  </Link>
                  <Badge tone={MASTERY_TONES[quiz.mastery]}>
                    {MASTERY_LABELS[quiz.mastery]}
                  </Badge>
                </div>
                <p className="text-ink-400 mt-0.5 text-xs">
                  {quiz.attemptCount} lượt · gần nhất {formatRelative(quiz.latestAt)}
                </p>
              </div>

              <div className="w-36 shrink-0">
                <AccuracyBar value={quiz.bestAccuracy} />
              </div>

              <div className="w-28 shrink-0 text-right">
                <p className="text-ink-50 text-sm font-semibold tabular-nums">
                  {formatPercent(quiz.bestAccuracy)}
                </p>
                <TrendChip trend={quiz.trend} />
              </div>

              <ButtonLink
                to={`/q/${quiz.slug}/play`}
                size="sm"
                variant="ghost"
                className="shrink-0"
                aria-label={`Luyện lại ${quiz.title}`}
              >
                <RotateCcw className="size-4" aria-hidden />
              </ButtonLink>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}

// ── Topic performance ──────────────────────────────────────────────────────
function TopicSection({
  topics,
}: {
  topics: ReturnType<typeof buildProgressReport>['topics']
}) {
  const strongest = topics[0]
  const weakest = topics.length > 1 ? topics[topics.length - 1] : null

  return (
    <section aria-labelledby="topics-heading">
      <div className="flex items-center gap-2">
        <Trophy className="text-violet-glow-300 size-4" aria-hidden />
        <h2
          id="topics-heading"
          className="font-display text-ink-50 text-lg font-semibold tracking-tight"
        >
          Theo chủ đề
        </h2>
      </div>
      <p className="text-ink-400 mt-1.5 text-sm">
        Độ chính xác trung bình của bạn trên từng chủ đề.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {strongest ? (
          <Card className="border-correct-400/30 p-5">
            <p className="text-correct-300 inline-flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="size-4" aria-hidden />
              Mạnh nhất
            </p>
            <p className="font-display text-ink-50 mt-2 text-lg font-semibold">
              {strongest.name}
            </p>
            <p className="text-ink-300 mt-1 text-sm">
              {formatPercent(strongest.averageAccuracy)} chính xác · {strongest.quizCount} đề
            </p>
          </Card>
        ) : null}

        {weakest ? (
          <Card className="border-wrong-400/30 p-5">
            <p className="text-wrong-300 inline-flex items-center gap-2 text-sm font-semibold">
              <TrendingDown className="size-4" aria-hidden />
              Cần chú ý
            </p>
            <p className="font-display text-ink-50 mt-2 text-lg font-semibold">
              {weakest.name}
            </p>
            <p className="text-ink-300 mt-1 text-sm">
              {formatPercent(weakest.averageAccuracy)} chính xác · {weakest.quizCount} đề
            </p>
            <ButtonLink to="/explore" size="sm" variant="ghost" className="mt-3 px-0">
              Luyện thêm chủ đề này
            </ButtonLink>
          </Card>
        ) : null}
      </div>
    </section>
  )
}

// ── Bits ───────────────────────────────────────────────────────────────────
function AccuracyBar({ value }: { value: number }) {
  const tone =
    value >= MASTERED_ACCURACY
      ? 'bg-correct-400'
      : value >= NEEDS_PRACTICE_ACCURACY
        ? 'bg-neon-400'
        : 'bg-wrong-400'

  return (
    <div
      className="bg-ink-800 h-1.5 w-full overflow-hidden rounded-full"
      role="img"
      aria-label={`Độ chính xác ${formatPercent(value)}`}
    >
      <div
        className={cn('h-full rounded-full', tone)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

function TrendChip({ trend }: { trend: number }) {
  if (trend > 2) {
    return (
      <span className="text-correct-300 mt-0.5 inline-flex items-center gap-1 text-xs">
        <TrendingUp className="size-3" aria-hidden />+{formatPercent(trend)}
      </span>
    )
  }

  if (trend < -2) {
    return (
      <span className="text-wrong-300 mt-0.5 inline-flex items-center gap-1 text-xs">
        <TrendingDown className="size-3" aria-hidden />
        {formatPercent(trend)}
      </span>
    )
  }

  return (
    <span className="text-ink-400 mt-0.5 inline-flex items-center gap-1 text-xs">
      <Minus className="size-3" aria-hidden />
      Ổn định
    </span>
  )
}

function ProgressSkeleton() {
  return (
    <div className="space-y-8">
      <Card className="p-6 sm:p-7">
        <Skeleton className="h-4 w-24" />
        <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <Card key={index} className="p-5">
            <Skeleton className="h-11 w-11 rounded-xl" />
            <Skeleton className="mt-4 h-4 w-3/4" />
            <Skeleton className="mt-2 h-3 w-full" />
          </Card>
        ))}
      </div>
    </div>
  )
}
