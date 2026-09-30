import { useCallback, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Download,
  FileQuestion,
  Pencil,
  Percent,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { MeterBar, VerticalBarChart, accuracyTone } from '@/features/manage/charts'
import { fetchQuizReport } from '@/features/manage/api'
import { PASS_THRESHOLD_PERCENT } from '@/features/manage/report'
import { DifficultyBadge } from '@/features/quiz/quiz-card-tile'
import { useAuth } from '@/features/auth/auth-context'
import {
  formatClock,
  formatCompact,
  formatDate,
  formatDuration,
  formatPercent,
} from '@/lib/format'
import { STATUS_LABELS } from '@/lib/labels'
import { usePageMeta } from '@/lib/seo'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAsyncData } from '@/lib/use-async-data'
import { cn } from '@/lib/utils'

/**
 * The date printed on the report. Resolved once when this lazily loaded chunk
 * is first fetched rather than on every render, which keeps the render pure and
 * gives the printed sheet a stable "generated on" line.
 */
const GENERATED_AT = formatDate(new Date().toISOString())

export function ManageQuizReportPage() {
  const { quizId } = useParams()
  const { isConfigured } = useAuth()

  // The console already marks itself noindex; this keeps the canonical honest
  // while the page is open.
  usePageMeta({
    title: 'Thống kê đề thi',
    path: `/manage/quizzes/${quizId ?? ''}/report`,
    noIndex: true,
  })

  const query = useAsyncData(
    `manage:report:${quizId ?? 'none'}`,
    () => fetchQuizReport(quizId!),
    Boolean(quizId) && isConfigured,
  )

  const card = query.data?.card ?? null
  const report = query.data?.report ?? null

  /**
   * Print to PDF.
   *
   * The browser's own "Save as PDF" produces a vector, selectable, correctly
   * paginated document — far better than a rasterised screenshot, and without a
   * PDF library in the bundle. The title is swapped for the duration of the
   * dialog so the suggested filename is meaningful, then restored.
   */
  const exportPdf = useCallback(() => {
    if (!card) return

    const previousTitle = document.title
    document.title = `bao-cao-${card.slug || 'de-thi'}`

    const restore = () => {
      document.title = previousTitle
      window.removeEventListener('afterprint', restore)
    }

    window.addEventListener('afterprint', restore)
    window.print()
  }, [card])

  const scoreData = useMemo(
    () =>
      (report?.scoreDistribution ?? []).map((bucket, index) => ({
        label: bucket.label,
        value: bucket.value,
        tone: index >= 3 ? ('correct' as const) : index === 2 ? ('spark' as const) : ('wrong' as const),
      })),
    [report],
  )

  if (!isSupabaseConfigured) {
    return (
      <div className="p-6 lg:p-10">
        <Alert tone="warning" title="Chưa kết nối Supabase">
          Cấu hình <code>.env.local</code> để xem thống kê.
        </Alert>
      </div>
    )
  }

  if (query.loading) {
    return (
      <div className="p-6 lg:p-10">
        <Skeleton className="h-8 w-64" />
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="mt-6 h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (query.error) {
    return (
      <div className="p-6 lg:p-10">
        <Alert tone="error" title="Không tải được thống kê">
          {query.error}
        </Alert>
      </div>
    )
  }

  if (!card || !report) {
    return (
      <div className="p-6 lg:p-10">
        <EmptyState
          icon={BarChart3}
          title="Không tìm thấy đề thi"
          description="Đề này có thể đã bị xoá, hoặc không thuộc tài khoản của bạn."
          action={<ButtonLink to="/manage/quizzes">Về danh sách đề</ButtonLink>}
        />
      </div>
    )
  }

  const hasAttempts = report.attemptCount > 0
  // Seeded or manually imported attempts can exist without per-question rows,
  // in which case the question ranking has nothing honest to say.
  const hasAnswerDetail = report.questions.some((question) => question.answered > 0)

  return (
    <div className="report-root p-6 lg:p-10">
      {/* ── Controls (never printed) ─────────────────────────────────── */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/manage/quizzes"
          className="text-ink-400 hover:text-neon-300 inline-flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Đề thi của tôi
        </Link>

        <div className="flex flex-wrap gap-3">
          <ButtonLink to={`/manage/quizzes/${card.id}`} variant="outline">
            <Pencil className="size-4" aria-hidden />
            Sửa đề
          </ButtonLink>

          <Button variant="spark" onClick={exportPdf} disabled={!hasAttempts}>
            <Download className="size-4" aria-hidden />
            Xuất PDF
          </Button>
        </div>
      </div>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="mt-6 flex flex-wrap items-start gap-4">
        <span
          className="border-ink-600 bg-ink-800/70 flex size-14 shrink-0 items-center justify-center rounded-2xl border text-2xl"
          aria-hidden
        >
          {card.cover_emoji}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-ink-400 text-xs font-medium uppercase tracking-[0.16em]">
            Báo cáo kết quả
          </p>
          <h1 className="font-display text-ink-50 mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {card.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={card.status === 'published' ? 'correct' : 'neutral'}>
              {STATUS_LABELS[card.status]}
            </Badge>
            <DifficultyBadge difficulty={card.difficulty} />
            {card.topic_name ? (
              <Badge tone="violet">
                <span aria-hidden>{card.topic_emoji}</span>
                {card.topic_name}
              </Badge>
            ) : null}
          </div>

          <p className="text-ink-400 mt-2 text-xs">
            {card.question_count} câu · {formatCompact(report.maxScore)} điểm tối đa ·{' '}
            {formatCompact(report.attemptCount)} lượt chơi
          </p>

          {/* Print-only provenance line. */}
          <p className="text-ink-500 mt-1 hidden text-xs print:block">
            Xuất ngày {GENERATED_AT} · Easy Quiz
          </p>
        </div>
      </header>

      {!hasAttempts ? (
        <EmptyState
          className="mt-10"
          icon={FileQuestion}
          title="Chưa có lượt chơi nào"
          description="Xuất bản đề và chia sẻ liên kết để học sinh làm bài. Số liệu sẽ xuất hiện ở đây ngay khi có lượt nộp đầu tiên."
          action={
            card.status === 'published' ? (
              <ButtonLink to={`/q/${card.slug}`} size="sm">
                Xem đề
              </ButtonLink>
            ) : (
              <ButtonLink to={`/manage/quizzes/${card.id}`} size="sm">
                Xuất bản đề
              </ButtonLink>
            )
          }
        />
      ) : (
        <>
          {/* ── Key figures ────────────────────────────────────────── */}
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Người tham gia"
              value={formatCompact(report.participantCount)}
              hint={`${formatCompact(report.attemptCount)} lượt làm bài`}
              icon={Users}
              tone="violet"
            />
            <MetricCard
              label="Tỉ lệ đạt"
              value={formatPercent(report.passRate)}
              hint={`Đạt từ ${PASS_THRESHOLD_PERCENT}% điểm trở lên`}
              icon={Target}
              tone={report.passRate >= 50 ? 'correct' : 'spark'}
            />
            <MetricCard
              label="Độ chính xác trung bình"
              value={formatPercent(report.averageAccuracy)}
              hint={`Điểm trung bình ${report.averageScore.toFixed(1)}/${report.maxScore}`}
              icon={Percent}
              tone="neon"
            />
            <MetricCard
              label="Điểm cao nhất"
              value={`${report.highScore}`}
              hint={`trên ${report.maxScore} điểm`}
              icon={TrendingUp}
              tone="correct"
            />
            <MetricCard
              label="Điểm thấp nhất"
              value={`${report.lowScore}`}
              hint={`trên ${report.maxScore} điểm`}
              icon={TrendingDown}
              tone="wrong"
            />
            <MetricCard
              label="Thời gian trung bình"
              value={report.completion.timedCount > 0 ? formatClock(report.completion.averageSeconds) : '—'}
              hint={
                report.completion.timedCount > 0
                  ? `Nhanh nhất ${formatClock(report.completion.fastestSeconds)}`
                  : 'Chưa ghi nhận thời lượng'
              }
              icon={Clock}
              tone="spark"
            />
          </div>

          {/* ── Score distribution ─────────────────────────────────── */}
          <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <Card className="report-card p-5 sm:p-6">
              <h2 className="font-display text-ink-50 text-base font-semibold">
                Phân bố điểm
              </h2>
              <p className="text-ink-400 mt-1 text-sm">
                Số lượt làm bài theo tỉ lệ điểm đạt được.
              </p>

              <VerticalBarChart
                className="mt-6"
                data={scoreData}
                ariaLabel={`Phân bố điểm: ${scoreData
                  .map((bucket) => `${bucket.label} có ${bucket.value} lượt`)
                  .join(', ')}`}
              />
            </Card>

            <Card className="report-card p-5 sm:p-6">
              <h2 className="font-display text-ink-50 text-base font-semibold">
                Thời gian hoàn thành
              </h2>
              <p className="text-ink-400 mt-1 text-sm">
                {report.completion.timedCount > 0
                  ? `${formatCompact(report.completion.timedCount)} lượt có ghi nhận thời lượng.`
                  : 'Chưa có lượt nào ghi nhận thời lượng.'}
              </p>

              <dl className="border-ink-600/60 mt-4 grid grid-cols-2 gap-4 border-y py-4 sm:grid-cols-4">
                <MiniStat
                  label="Trung bình"
                  value={
                    report.completion.timedCount > 0
                      ? formatClock(report.completion.averageSeconds)
                      : '—'
                  }
                />
                <MiniStat
                  label="Trung vị"
                  value={
                    report.completion.timedCount > 0
                      ? formatClock(report.completion.medianSeconds)
                      : '—'
                  }
                />
                <MiniStat
                  label="Nhanh nhất"
                  value={
                    report.completion.timedCount > 0
                      ? formatClock(report.completion.fastestSeconds)
                      : '—'
                  }
                />
                <MiniStat
                  label="Chậm nhất"
                  value={
                    report.completion.timedCount > 0
                      ? formatClock(report.completion.slowestSeconds)
                      : '—'
                  }
                />
              </dl>

              {report.completion.histogram.length > 0 ? (
                <VerticalBarChart
                  className="mt-5"
                  tone="violet"
                  data={report.completion.histogram}
                  ariaLabel={`Phân bố thời gian hoàn thành: ${report.completion.histogram
                    .map((bucket) => `${bucket.label} có ${bucket.value} lượt`)
                    .join(', ')}`}
                />
              ) : (
                <p className="text-ink-500 mt-5 text-sm">
                  Chưa đủ dữ liệu để vẽ biểu đồ thời gian.
                </p>
              )}
            </Card>
          </section>

          {/* ── Questions most often missed ────────────────────────── */}
          <Card className="report-card mt-6 overflow-hidden">
            <div className="border-ink-600/60 border-b px-5 py-4 sm:px-6">
              <h2 className="font-display text-ink-50 inline-flex items-center gap-2 text-base font-semibold">
                <TrendingDown className="text-wrong-300 size-4" aria-hidden />
                Câu hỏi sai nhiều nhất
              </h2>
              <p className="text-ink-400 mt-1 text-sm">
                Xếp theo số lượt trả lời sai — đây là phần nên giảng lại.
              </p>
            </div>

            {hasAnswerDetail ? (
              <ul className="divide-ink-600/50 divide-y">
                {report.questions.map((question) => (
                <li
                  key={question.questionId}
                  className="report-card px-5 py-4 sm:px-6"
                >
                  <div className="flex items-start gap-3">
                    <span className="bg-ink-800 text-ink-300 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums">
                      {question.position}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-ink-100 text-sm leading-snug">{question.prompt}</p>

                      {question.answered > 0 ? (
                        <>
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                            <span className="text-wrong-300 font-medium tabular-nums">
                              {question.wrong} lượt sai
                            </span>
                            <span className="text-ink-400 tabular-nums">
                              Đúng {question.correct}/{question.answered} ({formatPercent(question.correctRate)})
                            </span>
                            {question.averageSeconds > 0 ? (
                              <span className="text-ink-500 tabular-nums">
                                ~{formatDuration(question.averageSeconds)}
                              </span>
                            ) : null}
                          </div>

                          <MeterBar
                            className="mt-2.5"
                            percent={question.correctRate}
                            tone={accuracyTone(question.correctRate)}
                          />
                        </>
                      ) : (
                        <p className="text-ink-500 mt-1.5 text-xs">
                          Chưa có dữ liệu trả lời cho câu này.
                        </p>
                      )}
                    </div>
                  </div>
                </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-400 px-5 py-5 text-sm leading-relaxed sm:px-6">
                Các lượt làm bài này không kèm dữ liệu chi tiết từng câu (ví dụ dữ
                liệu mẫu hoặc được nhập tay), nên chưa xếp hạng được câu hỏi. Các
                chỉ số tổng quan và biểu đồ phía trên vẫn chính xác.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  hint?: string
  icon: typeof BarChart3
  tone: 'neon' | 'spark' | 'correct' | 'wrong' | 'violet'
}) {
  const tones = {
    neon: 'border-neon-400/40 bg-neon-400/10 text-neon-300',
    spark: 'border-spark-400/40 bg-spark-400/10 text-spark-300',
    correct: 'border-correct-400/40 bg-correct-500/10 text-correct-300',
    wrong: 'border-wrong-400/40 bg-wrong-500/10 text-wrong-300',
    violet: 'border-violet-glow-400/40 bg-violet-glow-500/10 text-violet-glow-300',
  } as const

  return (
    <Card className="report-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-ink-400 text-xs font-medium uppercase tracking-[0.16em]">{label}</p>
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg border', tones[tone])}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>

      <p className="font-display text-ink-50 mt-3 text-3xl font-semibold tabular-nums">
        {value}
      </p>

      {hint ? <p className="text-ink-400 mt-1 text-xs">{hint}</p> : null}
    </Card>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-400 text-[0.68rem] font-medium uppercase tracking-[0.14em]">
        {label}
      </dt>
      <dd className="font-display text-ink-50 mt-1 text-lg font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  )
}
