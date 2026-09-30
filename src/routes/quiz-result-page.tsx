import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  Home,
  RotateCcw,
  Share2,
  Trophy,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { ResultRevealVideo } from '@/components/remotion/players'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, Skeleton } from '@/components/ui/feedback'
import { ProgressRing } from '@/components/ui/metrics'
import { Reveal } from '@/components/ui/reveal'
import { AnswerTile, optionLetter } from '@/features/quiz/answer-tile'
import {
  fetchAttempt,
  fetchPersonalBest,
  fetchQuizCardBySlug,
  fetchQuizLeaderboard,
} from '@/features/quiz/api'
import { clearResult, readResult } from '@/features/quiz/result-store'
import { useAuth } from '@/features/auth/auth-context'
import { formatDuration, formatPercent, medalFor } from '@/lib/format'
import type { ReviewItem } from '@/lib/domain'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAsyncData } from '@/lib/use-async-data'
import { SITE_URL } from '@/lib/site'
import { cn } from '@/lib/utils'

export function QuizResultPage() {
  const { slug = '', attemptId = '' } = useParams()
  const { displayName, user } = useAuth()

  // A fresh submission is already in sessionStorage, including the full review.
  const [stashed] = useState(() => readResult(attemptId))

  const attemptQuery = useAsyncData(
    `attempt:${attemptId}`,
    () => fetchAttempt(attemptId),
    !stashed && isSupabaseConfigured,
  )

  const attempt = stashed?.attempt ?? attemptQuery.data

  // Only needed when the review is missing — the stash already carries the title.
  const card = useAsyncData(
    `result:card:${slug}`,
    () => fetchQuizCardBySlug(slug),
    !stashed && slug !== '' && isSupabaseConfigured,
  )

  const rank = useAsyncData(
    `rank:${attempt?.quiz_id ?? 'none'}:${attemptId}`,
    async () => {
      const board = await fetchQuizLeaderboard(attempt!.quiz_id, 100)
      const position = board.findIndex((entry) => entry.attempt_id === attemptId)
      return { position: position >= 0 ? position + 1 : null, total: board.length }
    },
    Boolean(attempt?.quiz_id) && isSupabaseConfigured,
  )

  const previousBest = useAsyncData(
    `prev-best:${attempt?.quiz_id ?? 'none'}:${user?.id ?? 'anon'}`,
    () => fetchPersonalBest(attempt!.quiz_id, user!.id, attemptId),
    Boolean(attempt?.quiz_id && user?.id),
  )

  const review = stashed?.review ?? []
  const quizTitle = stashed?.quiz.title ?? card.data?.title ?? 'Đề thi'
  const correctCount = attempt?.correct_count ?? 0
  const questionCount = attempt?.question_count ?? review.length
  const score = attempt?.score ?? 0
  const maxScore = attempt?.max_score ?? 0
  const accuracy = attempt?.accuracy ?? 0
  const durationSeconds = attempt?.duration_seconds ?? 0

  const isRecord = useMemo(
    () => score > 0 && previousBest.data !== null && score > previousBest.data,
    [score, previousBest.data],
  )

  const [shared, setShared] = useState(false)

  const handleShare = async () => {
    const shareUrl = `${SITE_URL}/q/${slug}`

    try {
      await navigator.clipboard.writeText(shareUrl)
      setShared(true)
      toast.success('Đã sao chép liên kết đề thi.')
      window.setTimeout(() => setShared(false), 2500)
    } catch {
      toast.error('Trình duyệt không cho phép sao chép. Hãy copy thủ công nhé.')
    }
  }

  if (attemptQuery.loading) {
    return (
      <div className="container-page py-16">
        <Card className="mx-auto max-w-3xl p-8">
          <Skeleton className="mx-auto size-40 rounded-full" />
          <Skeleton className="mx-auto mt-6 h-6 w-48" />
          <Skeleton className="mx-auto mt-3 h-4 w-64" />
        </Card>
      </div>
    )
  }

  if (!attempt) {
    return (
      <div className="container-page py-20">
        <EmptyState
          icon={XCircle}
          title="Không tìm thấy kết quả"
          description="Kết quả này có thể đã bị xoá, hoặc bạn không có quyền xem nó."
          action={<ButtonLink to={`/q/${slug}`}>Về trang đề thi</ButtonLink>}
        />
      </div>
    )
  }

  return (
    <main id="main-content" className="relative">
      <AuroraBackground variant="quiz" />

      <div className="container-page relative py-12">
        {/* ── The celebration ──────────────────────────────────────── */}
        <Reveal y={20}>
          <div className="border-ink-600/70 bg-ink-900/60 shadow-panel mx-auto max-w-4xl overflow-hidden rounded-2xl border p-2 backdrop-blur">
            <div className="bg-ink-950 aspect-[15/8] overflow-hidden rounded-xl">
              <ResultRevealVideo
                playerName={displayName}
                quizTitle={quizTitle}
                score={score}
                maxScore={maxScore}
                correctCount={correctCount}
                questionCount={questionCount}
                accuracy={accuracy}
                isRecord={isRecord}
                durationLabel={formatDuration(durationSeconds)}
              />
            </div>
          </div>
        </Reveal>

        {/* ── Summary ──────────────────────────────────────────────── */}
        <div className="mx-auto mt-10 grid max-w-4xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card className="flex flex-col items-center p-6 text-center">
            <ProgressRing
              percent={maxScore > 0 ? (score / maxScore) * 100 : accuracy}
              tone={accuracy >= 70 ? 'spark' : 'brand'}
            >
              <span className="font-display text-ink-50 text-4xl font-bold tabular-nums">
                {score}
              </span>
              <span className="text-ink-400 text-xs">/ {maxScore} điểm</span>
            </ProgressRing>

            <p className="text-ink-300 mt-4 text-sm">
              Đúng <span className="text-correct-300 font-semibold">{correctCount}</span> trên{' '}
              {questionCount} câu · {formatPercent(accuracy)} chính xác
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {isRecord ? <Badge tone="spark">🏆 Kỷ lục cá nhân</Badge> : null}
              {rank.data?.position ? (
                <Badge tone="neon">
                  {medalFor(rank.data.position) || '#' + rank.data.position} /{' '}
                  {rank.data.total} người
                </Badge>
              ) : null}
              <Badge tone="neutral">{formatDuration(durationSeconds)}</Badge>
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="p-6">
              <h2 className="font-display text-ink-50 text-lg font-semibold">
                {accuracy >= 90
                  ? 'Xuất sắc — gần như hoàn hảo!'
                  : accuracy >= 70
                    ? 'Làm tốt lắm!'
                    : accuracy >= 50
                      ? 'Khá ổn, còn dư địa để tiến bộ.'
                      : 'Đừng nản — xem lại lời giải nhé.'}
              </h2>

              <p className="text-ink-300 mt-2 text-sm leading-relaxed">
                Kết quả đã được ghi vào bảng xếp hạng của đề thi này. Xem lại từng câu bên dưới
                để biết mình sai ở đâu.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <ButtonLink to={`/q/${slug}/play`} variant="primary">
                  <RotateCcw className="size-4" aria-hidden />
                  Chơi lại
                </ButtonLink>

                <ButtonLink to={`/leaderboard?quiz=${slug}`} variant="outline">
                  <Trophy className="size-4" aria-hidden />
                  Bảng xếp hạng
                </ButtonLink>

                <Button variant="ghost" onClick={() => void handleShare()}>
                  <Share2 className="size-4" aria-hidden />
                  {shared ? 'Đã sao chép' : 'Chia sẻ đề'}
                </Button>
              </div>
            </Card>

            {!user ? (
              <Card className="border-spark-400/30 p-5">
                <p className="text-spark-300 text-sm font-semibold">
                  Muốn giữ lại thành tích này?
                </p>
                <p className="text-ink-300 mt-1.5 text-sm leading-relaxed">
                  Bạn đang chơi với tư cách khách. Tạo tài khoản để lưu hồ sơ, theo dõi tiến bộ
                  và không mất điểm khi đổi thiết bị.
                </p>
                <ButtonLink to="/register" variant="spark" size="sm" className="mt-4">
                  Tạo tài khoản
                  <ArrowRight className="size-3.5" aria-hidden />
                </ButtonLink>
              </Card>
            ) : null}
          </div>
        </div>

        {/* ── Review ───────────────────────────────────────────────── */}
        <section className="mx-auto mt-12 max-w-4xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-ink-50 text-xl font-semibold">
              Xem lại bài làm
            </h2>

            {review.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // The review can name the answer key, so it is dropped as
                  // soon as the player has seen it.
                  clearResult(attemptId)
                  toast.success('Đã xoá bản xem lại khỏi phiên làm việc.')
                }}
              >
                Xoá khỏi phiên
              </Button>
            ) : null}
          </div>

          {review.length === 0 ? (
            <Card className="mt-5 p-6">
              <p className="text-ink-300 text-sm leading-relaxed">
                Bản xem lại chi tiết chỉ hiện ngay sau khi bạn nộp bài. Điểm số và thứ hạng ở
                trên vẫn là kết quả chính thức từ máy chủ.
              </p>
              <ButtonLink to={`/q/${slug}/play`} variant="outline" size="sm" className="mt-4">
                Làm lại để xem lời giải
              </ButtonLink>
            </Card>
          ) : (
            <ol className="mt-5 space-y-4">
              {review.map((item) => (
                <ReviewCard key={item.question_id} item={item} />
              ))}
            </ol>
          )}
        </section>

        <div className="mt-12 flex justify-center">
          <ButtonLink to="/explore" variant="secondary">
            <Home className="size-4" aria-hidden />
            Về thư viện đề thi
          </ButtonLink>
        </div>
      </div>
    </main>
  )
}

function ReviewCard({ item }: { item: ReviewItem }) {
  const chosen = item.chosen_option_id

  return (
    <li>
      <Card
        className={cn(
          'p-5',
          item.is_correct ? 'border-correct-400/30' : 'border-wrong-400/30',
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
              item.is_correct
                ? 'bg-correct-500/20 text-correct-300'
                : 'bg-wrong-500/20 text-wrong-300',
            )}
            aria-hidden
          >
            {item.is_correct ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <XCircle className="size-4" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-ink-50 text-sm leading-relaxed font-medium">
              <span className="text-ink-400 mr-2 tabular-nums">Câu {item.position}.</span>
              {item.prompt}
            </p>

            <div className="mt-3 space-y-2">
              {item.options.map((option, index) => {
                const isChosen = option.id === chosen
                const state = option.is_correct
                  ? 'correct'
                  : isChosen
                    ? 'wrong'
                    : 'dim'

                return (
                  <AnswerTile
                    key={option.id}
                    letter={optionLetter(index)}
                    label={option.label}
                    state={state}
                    disabled
                  />
                )
              })}
            </div>

            {!chosen ? (
              <p className="text-spark-300 mt-3 text-xs">Bạn đã bỏ trống câu này.</p>
            ) : null}

            {item.explanation ? (
              <div className="border-ink-600/60 bg-ink-800/50 mt-4 rounded-xl border p-3.5">
                <p className="text-ink-400 text-[0.7rem] font-semibold uppercase tracking-[0.16em]">
                  Lời giải
                </p>
                <p className="text-ink-200 mt-1.5 text-sm leading-relaxed">
                  {item.explanation}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </Card>
    </li>
  )
}
