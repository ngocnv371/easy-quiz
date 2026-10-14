import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Flame,
  Home,
  Infinity as InfinityIcon,
  Layers,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Target,
  Pause,
  Timer,
  XCircle,
} from 'lucide-react'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { EasyQuizLogo } from '@/components/brand/logo'
import { Badge, accentTone } from '@/components/ui/badge'
import { Button, ButtonLink, Spinner } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { AnswerTile, optionLetter, type AnswerState } from '@/features/quiz/answer-tile'
import {
  AREA_HINTS,
  AREA_LABELS,
  areaStrength,
  sortByStrength,
  type AreaStrength,
} from '@/features/quiz/endless-progress'
import { useEndlessSession } from '@/features/quiz/use-endless-session'
import { useAuth } from '@/features/auth/auth-context'
import { formatClock, formatPercent } from '@/lib/format'
import { usePageMeta } from '@/lib/seo'
import type { EndlessTopicProgress } from '@/lib/domain'
import { cn, errorMessage } from '@/lib/utils'

/**
 * Endless mode.
 *
 * One screen, no start gate: as soon as the player has an identity the first
 * question is on screen, and every answer brings the next. The stream is drawn
 * from every published quiz and weighted by the player's per-topic mastery, so
 * it leans into their strengths while still sprinkling in the areas they are
 * learning. "Dừng" at any point ends the session with a summary — nothing is
 * lost, because nothing was a fixed-length attempt to begin with.
 */

const QUESTION_MOTIONS = [
  'animate-question-rise',
  'animate-question-slide',
  'animate-question-scale',
  'animate-question-flip',
  'animate-question-drop',
] as const

const STRENGTH_CHIP: Record<AreaStrength, string> = {
  strong: 'border-correct-400/40 bg-correct-500/10 text-correct-300',
  steady: 'border-spark-400/40 bg-spark-400/10 text-spark-300',
  new: 'border-ink-600 bg-ink-800/70 text-ink-300',
}

const STRENGTH_BAR: Record<AreaStrength, string> = {
  strong: 'bg-correct-400',
  steady: 'bg-spark-400',
  new: 'bg-ink-500',
}

export function EndlessPage() {
  const { user, status, isConfigured, signInAsGuest } = useAuth()
  const [authIssue, setAuthIssue] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const attemptedRef = useRef(false)

  usePageMeta({
    title: 'Chế độ vô tận',
    description:
      'Luyện trắc nghiệm không giới hạn: bắt đầu ngay, dừng lúc nào cũng được, và mỗi câu được chọn theo thế mạnh của bạn.',
    path: '/endless',
    noIndex: true,
  })

  // A guest identity is still an identity: the server needs someone to attribute
  // mastery to, so Endless signs in anonymously without asking anything first.
  const signIn = useCallback(async () => {
    setRetrying(true)
    setAuthIssue(null)

    try {
      await signInAsGuest('')
    } catch (error) {
      setAuthIssue(errorMessage(error))
    } finally {
      setRetrying(false)
    }
  }, [signInAsGuest])

  useEffect(() => {
    if (!isConfigured || status !== 'ready') return

    // A live session clears the guard, so a later dead session can re-guest.
    if (user) {
      attemptedRef.current = false
      return
    }

    if (attemptedRef.current) return

    attemptedRef.current = true
    void signIn()
  }, [isConfigured, status, user, signIn])

  const enabled = isConfigured && status === 'ready' && !!user
  const session = useEndlessSession(enabled)

  // ── Pre-session states ───────────────────────────────────────────────────
  if (!isConfigured) {
    return (
      <CenteredShell>
        <EmptyState
          icon={Sparkles}
          title="Chưa kết nối Supabase"
          description="Chế độ vô tận cần máy chủ để chấm điểm. Hãy cấu hình .env.local rồi thử lại."
          action={<ButtonLink to="/explore">Về thư viện</ButtonLink>}
        />
      </CenteredShell>
    )
  }

  if (status === 'loading' || (!user && !authIssue)) {
    return (
      <CenteredShell>
        <QuestionSkeleton />
      </CenteredShell>
    )
  }

  if (authIssue && !user) {
    return (
      <CenteredShell>
        <div className="mx-auto max-w-lg">
          <Alert tone="error" icon={Sparkles} title="Chưa mở được phiên chơi">
            {authIssue}
          </Alert>
          <div className="mt-6 flex gap-3">
            <Button onClick={() => void signIn()} loading={retrying}>
              Thử lại
            </Button>
            <ButtonLink to="/explore" variant="outline">
              Về thư viện
            </ButtonLink>
          </div>
        </div>
      </CenteredShell>
    )
  }

  return <EndlessPlayer session={session} />
}

// ── Player ────────────────────────────────────────────────────────────────

function EndlessPlayer({ session }: { session: ReturnType<typeof useEndlessSession> }) {
  const {
    phase,
    current,
    shown,
    selected,
    feedback,
    stats,
    progress,
    error,
    seconds,
    exhausted,
    selectOption,
    advance,
    stop,
    restart,
  } = session

  const grading = phase === 'grading'
  const accuracy = stats.answered === 0 ? 0 : (stats.correct / stats.answered) * 100
  const areas = sortByStrength(progress)

  // Cycle the entrance motion per question. `shown` only moves at a question
  // boundary, so a mid-question re-render (the feedback arriving) cannot replay
  // the animation under the player's eyes.
  const questionMotion = QUESTION_MOTIONS[shown % QUESTION_MOTIONS.length] ?? QUESTION_MOTIONS[0]

  // Keyboard: numbers pick an answer, Enter/Space skips the feedback wait.
  useEffect(() => {
    if (!current) return

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      if (phase === 'grading') {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') {
          event.preventDefault()
          advance()
        }
        return
      }

      if (phase !== 'playing') return

      const number = Number.parseInt(event.key, 10)
      if (Number.isInteger(number) && number >= 1 && number <= current.options.length) {
        const option = current.options[number - 1]
        if (option) {
          event.preventDefault()
          selectOption(option.id)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [current, phase, selectOption, advance])

  const showSkeleton =
    phase === 'loading' || (!current && phase !== 'stopped' && phase !== 'error' && !exhausted)

  return (
    <div className="bg-ink-950 relative flex min-h-dvh flex-col overflow-hidden">
      <AuroraBackground grid={false} variant="quiz" />

      <div className="relative flex min-h-dvh flex-col">
        {/* ── Top bar ─────────────────────────────────────────────────── */}
        <header className="border-ink-600/50 border-b backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-5 py-3.5">
            <Link to="/" aria-label="Easy Quiz" className="shrink-0">
              <EasyQuizLogo markClassName="size-7" />
            </Link>

            <Badge tone="violet" icon={InfinityIcon} className="hidden sm:inline-flex">
              Vô tận
            </Badge>

            <div className="ml-auto flex items-center gap-1.5">
              <StatPill icon={Flame} tone={stats.streak >= 2 ? 'spark' : 'neutral'}>
                <span key={stats.streak} className="animate-pop inline-block">
                  {stats.streak}
                </span>
              </StatPill>

              <StatPill icon={Target} tone="neon">
                {formatPercent(accuracy)}
              </StatPill>

              <StatPill icon={Timer} tone="neutral" className="hidden sm:inline-flex">
                {formatClock(seconds)}
              </StatPill>
            </div>

            <Button variant="ghost" size="sm" onClick={stop} className="shrink-0">
              <Pause className="size-4" aria-hidden />
              Dừng
            </Button>
          </div>
        </header>

        {/* ── Question ───────────────────────────────────────────────── */}
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-8">
          {showSkeleton ? (
            <QuestionSkeleton />
          ) : !current ? (
            <EmptyState
              icon={Sparkles}
              title="Bạn đã đi hết kho câu hỏi"
              description="Hiện chưa còn câu nào mới cho bạn luyện. Chơi lại từ đầu để gặp lại những câu đã làm."
              action={
                <div className="flex flex-wrap justify-center gap-3">
                  <Button onClick={() => void restart()}>
                    <RotateCcw className="size-4" aria-hidden />
                    Chơi lại
                  </Button>
                  <ButtonLink to="/explore" variant="outline">
                    Xem thêm đề
                  </ButtonLink>
                </div>
              }
            />
          ) : (
            <div key={current.id} className={cn(questionMotion, 'w-full')}>
              <div className="flex flex-wrap items-center gap-2">
                {current.topic ? (
                  <Badge tone={accentTone(current.topic.accent)}>
                    <span aria-hidden>{current.topic.emoji}</span>
                    {current.topic.name}
                  </Badge>
                ) : (
                  <Badge tone="neutral" icon={Layers}>
                    Tổng hợp
                  </Badge>
                )}

                <Badge tone="neutral">
                  <span aria-hidden>{current.quiz.cover_emoji}</span>
                  <span className="max-w-[14rem] truncate">{current.quiz.title}</span>
                </Badge>
              </div>

              <h1 className="font-display text-ink-50 mt-5 text-xl leading-snug font-semibold sm:text-2xl">
                {current.prompt}
              </h1>

              {current.image_url ? (
                <img
                  src={current.image_url}
                  alt=""
                  className="border-ink-600/60 mt-5 max-h-72 w-full rounded-2xl border object-contain"
                />
              ) : null}

              <div className="mt-7 space-y-3">
                {current.options.map((option, optionIndex) => {
                  const state = answerState(option.id, selected, feedback)
                  return (
                    <div
                      key={option.id}
                      className="animate-answer-in"
                      style={{ animationDelay: `${optionIndex * 55}ms` }}
                    >
                      <AnswerTile
                        letter={optionLetter(optionIndex)}
                        label={option.label}
                        state={state}
                        disabled={grading || !!feedback}
                        onClick={() => selectOption(option.id)}
                        className={cn(
                          state === 'correct' && 'animate-ring-correct',
                          state === 'wrong' && 'animate-ring-wrong',
                        )}
                      />
                    </div>
                  )
                })}
              </div>

              {feedback ? (
                <FeedbackBanner feedback={feedback} onAdvance={advance} />
              ) : (
                <p className="text-ink-500 mt-4 hidden text-xs sm:block">
                  Nhấn phím <kbd className="border-ink-600 rounded border px-1">1</kbd>–
                  <kbd className="border-ink-600 rounded border px-1">{current.options.length}</kbd>{' '}
                  để chọn đáp án.
                </p>
              )}
            </div>
          )}
        </main>

        {/* ── Areas ──────────────────────────────────────────────────── */}
        <footer className="border-ink-600/50 border-t backdrop-blur-sm">
          <div className="mx-auto w-full max-w-3xl px-5 py-3">
            {areas.length === 0 ? (
              <p className="text-ink-500 flex items-center gap-2 text-xs">
                <Brain className="size-3.5 shrink-0" aria-hidden />
                Trả lời vài câu để xem hồ sơ năng lực của bạn theo từng môn.
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-ink-500 hidden shrink-0 items-center gap-1.5 text-xs sm:flex">
                  <Brain className="size-3.5" aria-hidden />
                  Khu vực
                </span>
                <div className="flex flex-1 items-center gap-1.5 overflow-x-auto pb-0.5">
                  {areas.map((area) => (
                    <AreaChip key={area.topic_id} area={area} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </footer>
      </div>

      {/* ── Stop summary ─────────────────────────────────────────────── */}
      {phase === 'stopped' ? (
        <StopSummary
          stats={stats}
          areas={areas}
          seconds={seconds}
          onRestart={() => void restart()}
        />
      ) : null}

      {/* ── Error ────────────────────────────────────────────────────── */}
      {phase === 'error' ? (
        <div className="bg-ink-950/85 fixed inset-0 z-50 flex items-center justify-center p-5 backdrop-blur">
          <Card className="animate-pop w-full max-w-md p-6">
            <Alert tone="error" icon={Sparkles} title="Có lỗi xảy ra">
              {error}
            </Alert>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => void restart()}>
                <RotateCcw className="size-4" aria-hidden />
                Thử lại
              </Button>
              <ButtonLink to="/" variant="outline">
                <Home className="size-4" aria-hidden />
                Trang chủ
              </ButtonLink>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────────

/** Which visual state an option is in, given the answer and any feedback. */
function answerState(
  optionId: string,
  selected: string | null,
  feedback: { is_correct: boolean; correct_option_id: string | null } | null,
): AnswerState {
  if (feedback) {
    if (optionId === feedback.correct_option_id) return 'correct'
    if (optionId === selected) return 'wrong'
    return 'dim'
  }

  return optionId === selected ? 'selected' : 'idle'
}

function FeedbackBanner({
  feedback,
  onAdvance,
}: {
  feedback: {
    is_correct: boolean
    explanation: string | null
  }
  onAdvance: () => void
}) {
  return (
    <div
      className={cn(
        'animate-feedback-in mt-5 rounded-2xl border p-4',
        feedback.is_correct
          ? 'border-correct-400/40 bg-correct-500/10'
          : 'border-wrong-400/40 bg-wrong-500/10',
      )}
      role="status"
    >
      <div className="flex items-start gap-3">
        {feedback.is_correct ? (
          <CheckCircle2 className="text-correct-400 mt-0.5 size-5 shrink-0" aria-hidden />
        ) : (
          <XCircle className="text-wrong-400 mt-0.5 size-5 shrink-0" aria-hidden />
        )}

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'font-display text-sm font-semibold',
              feedback.is_correct ? 'text-correct-300' : 'text-wrong-300',
            )}
          >
            {feedback.is_correct ? (
              <>
                Chính xác!
                <span className="animate-pop ml-2 inline-block">⚡</span>
              </>
            ) : (
              'Chưa đúng'
            )}
          </p>

          {feedback.explanation ? (
            <p className="text-ink-300 mt-1 flex gap-2 text-sm leading-relaxed">
              <Lightbulb className="text-spark-300 mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{feedback.explanation}</span>
            </p>
          ) : null}
        </div>

        <Button
          size="sm"
          variant={feedback.is_correct ? 'secondary' : 'primary'}
          onClick={onAdvance}
          className="shrink-0"
        >
          Tiếp
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

function AreaChip({ area }: { area: EndlessTopicProgress }) {
  const strength = areaStrength(area.accuracy, area.answered)

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
        STRENGTH_CHIP[strength],
      )}
      title={`${AREA_LABELS[strength]} · ${AREA_HINTS[strength]}`}
    >
      <span aria-hidden>{area.emoji}</span>
      <span className="text-ink-200 max-w-[7rem] truncate">{area.name}</span>
      <span className="font-mono tabular-nums">{formatPercent(area.accuracy)}</span>
    </span>
  )
}

function StatPill({
  icon: Icon,
  tone = 'neutral',
  className,
  children,
}: {
  icon: typeof Flame
  tone?: 'neutral' | 'spark' | 'neon'
  className?: string
  children: ReactNode
}) {
  const tones = {
    neutral: 'border-ink-600 bg-ink-800/70 text-ink-100',
    spark: 'border-spark-400/40 bg-spark-400/10 text-spark-300',
    neon: 'border-neon-400/40 bg-neon-400/10 text-neon-300',
  } as const

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums',
        tones[tone],
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {children}
    </span>
  )
}

function StopSummary({
  stats,
  areas,
  seconds,
  onRestart,
}: {
  stats: { answered: number; correct: number; bestStreak: number }
  areas: EndlessTopicProgress[]
  seconds: number
  onRestart: () => void
}) {
  const accuracy = stats.answered === 0 ? 0 : (stats.correct / stats.answered) * 100

  return (
    <div className="bg-ink-950/85 fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-5 backdrop-blur">
      <Card className="animate-pop my-auto w-full max-w-lg p-6">
        <div className="flex items-center gap-3">
          <span className="border-neon-400/40 bg-neon-400/10 text-neon-300 flex size-11 items-center justify-center rounded-2xl border">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-ink-50 text-lg font-semibold">Phiên luyện tập</h2>
            <p className="text-ink-400 text-sm">Bạn đã dừng sau {formatClock(seconds)}.</p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryStat label="Đã làm" value={stats.answered} />
          <SummaryStat label="Đúng" value={stats.correct} tone="correct" />
          <SummaryStat label="Chính xác" value={formatPercent(accuracy)} />
          <SummaryStat label="Chuỗi dài nhất" value={stats.bestStreak} tone="spark" />
        </dl>

        {areas.length > 0 ? (
          <div className="border-ink-600/60 mt-6 border-t pt-5">
            <p className="text-ink-400 text-[0.7rem] font-medium tracking-[0.16em] uppercase">
              Hồ sơ năng lực
            </p>
            <ul className="mt-3 space-y-3">
              {areas.map((area) => {
                const strength = areaStrength(area.accuracy, area.answered)
                return (
                  <li key={area.topic_id} className="flex items-center gap-3">
                    <span aria-hidden>{area.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-ink-100 truncate text-sm">{area.name}</span>
                        <span className="text-ink-400 shrink-0 font-mono text-xs tabular-nums">
                          {area.correct}/{area.answered}
                        </span>
                      </div>
                      <div className="bg-ink-800 mt-1.5 h-1.5 overflow-hidden rounded-full">
                        <div
                          className={cn('h-full rounded-full', STRENGTH_BAR[strength])}
                          style={{ width: `${Math.max(area.accuracy, 3)}%` }}
                        />
                      </div>
                    </div>
                    <span className={cn('shrink-0 text-xs font-medium', STRENGTH_CHIP[strength], 'rounded-full border px-2 py-0.5')}>
                      {AREA_LABELS[strength]}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        <div className="mt-7 flex flex-wrap gap-3">
          <Button onClick={onRestart}>
            <RotateCcw className="size-4" aria-hidden />
            Chơi tiếp
          </Button>
          <ButtonLink to="/" variant="outline">
            <Home className="size-4" aria-hidden />
            Trang chủ
          </ButtonLink>
          <ButtonLink to="/explore" variant="ghost">
            Thư viện đề
          </ButtonLink>
        </div>
      </Card>
    </div>
  )
}

function SummaryStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: ReactNode
  tone?: 'neutral' | 'correct' | 'spark'
}) {
  const tones = {
    neutral: 'text-ink-50',
    correct: 'text-correct-300',
    spark: 'text-spark-300',
  } as const

  return (
    <div className="bg-ink-800/60 rounded-xl border border-ink-600/60 px-3 py-3">
      <dt className="text-ink-400 text-[0.65rem] font-medium tracking-[0.14em] uppercase">
        {label}
      </dt>
      <dd className={cn('font-display mt-1 text-xl font-semibold tabular-nums', tones[tone])}>
        {value}
      </dd>
    </div>
  )
}

function QuestionSkeleton() {
  return (
    <Card className="mx-auto w-full max-w-3xl p-6 sm:p-8">
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-32 rounded-full" />
      </div>
      <Skeleton className="mt-6 h-7 w-4/5" />
      <Skeleton className="mt-3 h-7 w-2/5" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-2xl" />
        ))}
      </div>

      <div className="text-ink-400 mt-6 flex items-center gap-2 text-sm">
        <Spinner className="text-neon-400 size-4" />
        Đang lấy câu hỏi đầu tiên…
      </div>
    </Card>
  )
}

function CenteredShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-ink-950 relative flex min-h-dvh flex-col">
      <AuroraBackground variant="quiz" />

      <header className="relative border-b border-ink-600/50">
        <div className="mx-auto flex w-full max-w-3xl items-center px-5 py-4">
          <Link to="/" aria-label="Easy Quiz">
            <EasyQuizLogo markClassName="size-7" />
          </Link>
        </div>
      </header>

      <main className="relative flex flex-1 items-center px-5 py-10">
        <div className="w-full">{children}</div>
      </main>
    </div>
  )
}
