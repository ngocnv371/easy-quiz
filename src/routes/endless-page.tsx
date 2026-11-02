import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
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
  Trophy,
  XCircle,
} from 'lucide-react'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { EasyQuizLogo } from '@/components/brand/logo'
import { UserMenu } from '@/components/layout/user-menu'
import { QuestionRevealVideo } from '@/components/remotion/players'
import { Button, ButtonLink, Spinner } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Modal } from '@/components/ui/modal'
import { ShortAnswerInput, TrueFalseStatement } from '@/features/quiz/answer-inputs'
import { AnswerTile, optionLetter, type AnswerState } from '@/features/quiz/answer-tile'
import type { EndlessAnswer } from '@/features/quiz/endless-api'
import {
  QUESTION_MOTION_RECIPES,
  tokenizePrompt,
} from '@/features/quiz/question-motion'
import { MIN_ANSWERED, sortByStrength } from '@/features/quiz/endless-progress'
import { fetchTopics } from '@/features/quiz/api'
import { TopicProgressList } from '@/features/quiz/topic-progress-list'
import { TopicScopePicker } from '@/features/quiz/topic-scope-picker'
import { ROUND_SIZE, useEndlessSession, type EndlessAnswered } from '@/features/quiz/use-endless-session'
import { useAuth } from '@/features/auth/auth-context'
import { AdBreak } from '@/features/ads/ad-break'
import { useShowAds } from '@/features/ads/adsense'
import { formatClock, formatPercent } from '@/lib/format'
import { usePageMeta } from '@/lib/seo'
import { useAsyncData } from '@/lib/use-async-data'
import { accentColor } from '@/remotion/question-reveal'
import type { EndlessGrade, EndlessQuestion, EndlessTopicProgress, TopicRow } from '@/lib/domain'
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

/**
 * How long the Remotion intro beat holds before the elements animate in. Slightly
 * shorter than the composition, so the words start as the ring bursts.
 */
const INTRO_LEAD_MS = 430

export function EndlessPage() {
  const { user, status, signInAsGuest } = useAuth()
  const [authIssue, setAuthIssue] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const attemptedRef = useRef(false)

  usePageMeta({
    title: 'Chế độ vô tận',
    description:
      'Luyện trắc nghiệm liên tục: bắt đầu ngay, dừng lúc nào cũng được, và mỗi câu được chọn theo thế mạnh của bạn.',
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
    if (status !== 'ready') return

    // A live session clears the guard, so a later dead session can re-guest.
    if (user) {
      attemptedRef.current = false
      return
    }

    if (attemptedRef.current) return

    attemptedRef.current = true
    void signIn()
  }, [status, user, signIn])

  // ── Subject scope ────────────────────────────────────────────────────────
  // `/endless?topic=<slug>` pins the stream to one subject; the slug resolves
  // against the live topic list, so a stale link quietly falls back to "all".
  const [params, setParams] = useSearchParams()
  const topicSlug = params.get('topic')

  const topics = useAsyncData('endless:topics', fetchTopics)

  const scopedTopic = topicSlug
    ? ((topics.data ?? []).find((topic) => topic.slug === topicSlug) ?? null)
    : null
  const topicId = scopedTopic?.id ?? null

  const setScope = useCallback(
    (slug: string | null) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          if (!slug) next.delete('topic')
          else next.set('topic', slug)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  // Wait for the topic list so a deep-linked scope boots already scoped.
  const scopeReady = topicSlug === null || !topics.loading

  const enabled = status === 'ready' && !!user && scopeReady

  // ── Pre-session states ───────────────────────────────────────────────────
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
            <ButtonLink to="/" variant="outline">
              Về trang chủ
            </ButtonLink>
          </div>
        </div>
      </CenteredShell>
    )
  }

  return (
    <EndlessSession
      // A scope change starts a fresh stream, so remount the session rather
      // than threading a reset through the hook.
      key={topicId ?? 'all'}
      enabled={enabled}
      topicId={topicId}
      topics={topics.data ?? []}
      topicSlug={topicSlug}
      onScopeChange={setScope}
    />
  )
}

/** Owns the session, so changing the scope cleanly remounts it. */
function EndlessSession({
  enabled,
  topicId,
  topics,
  topicSlug,
  onScopeChange,
}: {
  enabled: boolean
  topicId: string | null
  topics: TopicRow[]
  topicSlug: string | null
  onScopeChange: (slug: string | null) => void
}) {
  const session = useEndlessSession(enabled, topicId)

  return (
    <EndlessPlayer
      session={session}
      topics={topics}
      topicSlug={topicSlug}
      onScopeChange={onScopeChange}
    />
  )
}

// ── Player ────────────────────────────────────────────────────────────────

function EndlessPlayer({
  session,
  topics,
  topicSlug,
  onScopeChange,
}: {
  session: ReturnType<typeof useEndlessSession>
  topics: TopicRow[]
  topicSlug: string | null
  onScopeChange: (slug: string | null) => void
}) {
  const {
    phase,
    current,
    shown,
    selected,
    feedback,
    stats,
    history,
    round,
    roundStart,
    progress,
    error,
    seconds,
    exhausted,
    answer,
    advance,
    nextRound,
    stop,
    restart,
  } = session

  // The ad break, unless the player is ad-free, sits in front of carrying on: pressing "Vòng tiếp
  // theo" or "Chơi tiếp" plays it once two rounds' worth of answers have come in since the last one.
  // A summary always opens straight away. `adShownAt` is where `history.length` stood at the last
  // break; a new run shifts it back by the old run's answers, so stopping and starting again doesn't
  // reset the count.
  const showAds = useShowAds()
  const [adShownAt, setAdShownAt] = useState(0)
  const [adBefore, setAdBefore] = useState<'nextRound' | 'restart' | null>(null)
  const adDue = showAds && history.length - adShownAt >= ROUND_SIZE * ADS_EVERY_ROUNDS
  const restartRun = () => {
    setAdShownAt((previous) => previous - history.length)
    void restart()
  }
  const carryOn = (next: 'nextRound' | 'restart') => {
    if (adDue) setAdBefore(next)
    else if (next === 'nextRound') nextRound()
    else restartRun()
  }
  const afterAd = () => {
    const next = adBefore
    setAdBefore(null)
    setAdShownAt(history.length)
    if (next === 'nextRound') nextRound()
    else restartRun()
  }

  // Where the player is in the round. While a question waits for its answer it is already counted.
  const roundAnswered = history.length - roundStart
  const roundQuestion = Math.min(ROUND_SIZE, roundAnswered + (feedback || phase === 'roundEnd' ? 0 : 1))

  const grading = phase === 'grading'
  const accuracy = stats.answered === 0 ? 0 : (stats.correct / stats.answered) * 100
  const areas = sortByStrength(progress)
  const scopeTopic = topicSlug ? (topics.find((topic) => topic.slug === topicSlug) ?? null) : null
  const scopeName = scopeTopic?.name ?? null

  const reduceMotion = useReducedMotion()

  // Cycle the element choreography per question. `shown` only moves at a
  // question boundary, so a mid-question re-render cannot replay it.
  const recipe =
    QUESTION_MOTION_RECIPES[shown % QUESTION_MOTION_RECIPES.length] ?? QUESTION_MOTION_RECIPES[0]
  const promptWords = current ? tokenizePrompt(current.prompt, recipe.prompt.unit) : []
  // Each unit's position across the whole prompt, so the stagger runs word to word.
  const promptOffsets = promptWords.map((_, wordIndex) =>
    promptWords.slice(0, wordIndex).reduce((count, word) => count + word.length, 0),
  )

  // The Remotion beat announces the question number; the prompt words and
  // answer tiles animate themselves.
  const revealAccent = accentColor(current?.topic?.accent ?? null)

  // With reduced motion requested, start every element in its settled state.
  const motionFrom = reduceMotion ? 'visible' : 'hidden'

  // The intro beat plays on every question after the first, hiding the card and
  // then handing off to the element animations. `introShownFor` records which
  // question has been handed off, so a mid-question re-render never re-hides it.
  const [introShownFor, setIntroShownFor] = useState(0)
  const introReady = reduceMotion || shown === 0 || introShownFor === shown
  const [scopeOpen, setScopeOpen] = useState(false)

  useEffect(() => {
    if (reduceMotion || shown === 0) return

    const timer = window.setTimeout(() => setIntroShownFor(shown), INTRO_LEAD_MS)
    return () => window.clearTimeout(timer)
  }, [shown, reduceMotion])

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

      if (phase !== 'playing' || current.kind !== 'single') return

      const number = Number.parseInt(event.key, 10)
      if (Number.isInteger(number) && number >= 1 && number <= current.options.length) {
        const option = current.options[number - 1]
        if (option) {
          event.preventDefault()
          answer({ option_id: option.id })
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [current, phase, answer, advance])

  const showSkeleton =
    phase === 'loading' || (!current && phase !== 'stopped' && phase !== 'error' && !exhausted)

  return (
    <div className="bg-ink-950 relative flex min-h-dvh flex-col overflow-clip">
      <AuroraBackground grid={false} variant="quiz" />

      <div className="relative flex min-h-dvh flex-col">
        {/* ── Top bar ─────────────────────────────────────────────────── */}
        <header className="border-ink-600/50 bg-ink-950/80 sticky top-0 z-20 border-b backdrop-blur-sm">
          <div className="relative mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3 sm:px-5 sm:py-3.5">
            <Link to="/" aria-label="Easy Quiz" className="shrink-0">
              {/* Just the mark on a phone, so the subject keeps its name. */}
              <EasyQuizLogo
                compact
                markClassName="size-8"
                tagline={
                  <span className="inline-flex items-center gap-1">
                    <InfinityIcon className="size-3" aria-hidden />
                    Chế độ vô tận
                  </span>
                }
              />
            </Link>

            {/* The subject label takes whatever room the brand and stats leave. */}
            <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2">
              {/* The subject's name sits under the bar, where a long one has room; this button only changes it. */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setScopeOpen(true)}
                className="shrink-0 gap-1.5 px-2.5 sm:px-3"
                data-cy="endless-scope"
                aria-label={`Đổi chủ đề (đang luyện: ${scopeName ?? 'tất cả môn'})`}
              >
                <Layers className="size-4 shrink-0" aria-hidden />
                Đổi chủ đề
              </Button>

              <StatPill icon={Flame} tone={stats.streak >= 2 ? 'spark' : 'neutral'} dataCy="endless-streak">
                <span key={stats.streak} className="animate-pop inline-block">
                  {stats.streak}
                </span>
              </StatPill>

              <StatPill icon={Target} tone="neon" dataCy="endless-accuracy">
                {formatPercent(accuracy)}
              </StatPill>
            </div>

            {/* The round's progress, along the bar's bottom edge. */}
            <div
              className="bg-ink-800/80 absolute inset-x-0 -bottom-px h-0.5 overflow-hidden"
              role="progressbar"
              aria-label={`Vòng ${round}`}
              aria-valuemin={0}
              aria-valuemax={ROUND_SIZE}
              aria-valuenow={roundAnswered}
              data-cy="endless-round-progress"
            >
              <div
                className="from-neon-400 to-violet-glow-400 h-full bg-gradient-to-r transition-[width] duration-500"
                style={{ width: `${(Math.min(roundAnswered, ROUND_SIZE) / ROUND_SIZE) * 100}%` }}
              />
            </div>

            {/* Just under the bar, well away from the answers: what is being practised on the left (a
                long subject wraps rather than squeezing the bar), the clock and stop on the right. */}
            <div className="pointer-events-none absolute inset-x-4 top-full mt-3 flex items-start justify-between gap-3 sm:inset-x-5">
              <button
                type="button"
                onClick={() => setScopeOpen(true)}
                data-cy="endless-scope-name"
                title="Đổi chủ đề"
                className="text-ink-200 hover:text-ink-50 pointer-events-auto mt-1 min-w-0 text-left text-sm leading-snug transition-colors"
              >
                <span className="text-ink-400 block text-[0.65rem] font-medium tracking-[0.14em] uppercase" data-cy="endless-round">
                  Vòng {round} · Câu {roundQuestion}/{ROUND_SIZE}
                </span>
                <span className="line-clamp-3 font-medium sm:line-clamp-2">
                  {scopeTopic ? (
                    <span aria-hidden className="mr-1">
                      {scopeTopic.emoji}
                    </span>
                  ) : null}
                  {scopeName ?? 'Tất cả môn'}
                </span>
              </button>

              <button
                type="button"
                onClick={stop}
                data-cy="endless-stop"
                aria-label={`Dừng phiên luyện tập (${formatClock(seconds)})`}
                className="border-ink-600/70 bg-ink-900/90 hover:border-ink-500 hover:bg-ink-800 text-ink-100 pointer-events-auto inline-flex shrink-0 items-center gap-2 rounded-full border py-2 pr-3.5 pl-3 text-sm sm:gap-2.5 sm:pr-4 sm:pl-3.5 font-medium shadow-lg shadow-black/40 backdrop-blur transition-colors"
              >
                <span className="text-ink-300 inline-flex items-center gap-1.5 tabular-nums" data-cy="endless-timer">
                  <Timer className="hidden size-4 sm:block" aria-hidden />
                  {formatClock(seconds)}
                </span>
                <span className="bg-ink-600 h-4 w-px" aria-hidden />
                <span className="inline-flex items-center gap-1.5">
                  <Pause className="size-4" aria-hidden />
                  Dừng
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* ── Question ───────────────────────────────────────────────── */}
        <main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 pt-20 pb-6 sm:px-5 sm:pt-24 sm:pb-8">
          {current && shown > 0 && !reduceMotion ? (
            <div
              data-cy="endless-reveal"
              aria-hidden
              className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
            >
              {/* Keyed by `shown` so each question replays the composition from frame zero. */}
              <QuestionRevealVideo key={shown} accent={revealAccent} index={shown + 1} />
            </div>
          ) : null}

          {showSkeleton ? (
            <QuestionSkeleton />
          ) : !current ? (
            <EmptyState
              icon={Sparkles}
              title="Bạn đã đi hết kho câu hỏi"
              description={
                scopeName
                  ? `Bạn đã làm hết câu hỏi của môn ${scopeName}. Đổi sang môn khác, hoặc chơi lại từ đầu để gặp lại những câu đã làm.`
                  : 'Hiện chưa còn câu nào mới cho bạn luyện. Chơi lại từ đầu để gặp lại những câu đã làm.'
              }
              action={
                <div className="flex flex-wrap justify-center gap-3">
                  <Button onClick={restartRun}>
                    <RotateCcw className="size-4" aria-hidden />
                    Chơi lại
                  </Button>
                  {topicSlug ? (
                    <Button variant="outline" onClick={() => onScopeChange(null)}>
                      Học tất cả môn
                    </Button>
                  ) : null}
                </div>
              }
            />
          ) : (
            <div
              key={current.id}
              className="w-full transition-opacity duration-300"
              style={{ opacity: introReady ? 1 : 0 }}
            >

              <motion.h1
                data-cy="endless-prompt"
                className="font-display text-ink-50 text-xl leading-snug font-semibold sm:text-2xl"
                variants={recipe.prompt.container}
                initial={motionFrom}
                animate={introReady ? 'visible' : 'hidden'}
              >
                {promptWords.map((units, wordIndex) => (
                  <Fragment key={`${wordIndex}-${units.join('')}`}>
                    <span className="inline-block whitespace-nowrap">
                      {units.map((unit, unitIndex) => (
                        <motion.span
                          key={unitIndex}
                          custom={(promptOffsets[wordIndex] ?? 0) + unitIndex}
                          variants={recipe.prompt.item}
                          className="inline-block"
                        >
                          {unit}
                        </motion.span>
                      ))}
                    </span>
                    {wordIndex < promptWords.length - 1 ? ' ' : null}
                  </Fragment>
                ))}
              </motion.h1>

              {current.image_url ? (
                <img
                  src={current.image_url}
                  alt=""
                  className="border-ink-600/60 mt-5 max-h-72 w-full rounded-2xl border object-contain"
                />
              ) : null}

              {current.kind === 'single' ? (
                <motion.div
                  data-cy="endless-options"
                  className="mt-5 space-y-2.5 sm:mt-7 sm:space-y-3"
                  variants={recipe.choice.container}
                  initial={motionFrom}
                  animate={introReady ? 'visible' : 'hidden'}
                >
                  {current.options.map((option, optionIndex) => {
                    const state = answerState(option.id, selected, feedback)
                    return (
                      <motion.div
                        key={option.id}
                        custom={optionIndex}
                        variants={recipe.choice.item}
                      >
                        <AnswerTile
                          letter={optionLetter(optionIndex)}
                          label={option.label}
                          state={state}
                          disabled={grading || !!feedback}
                          onClick={() => answer({ option_id: option.id })}
                          className={cn(
                            state === 'correct' && 'animate-ring-correct',
                            state === 'wrong' && 'animate-ring-wrong',
                          )}
                        />
                      </motion.div>
                    )
                  })}
                </motion.div>
              ) : (
                <motion.div
                  data-cy="endless-options"
                  className="mt-5 sm:mt-7"
                  variants={recipe.choice.container}
                  initial={motionFrom}
                  animate={introReady ? 'visible' : 'hidden'}
                >
                  <motion.div custom={0} variants={recipe.choice.item}>
                    <CheckedAnswer question={current} feedback={feedback} disabled={grading} onCheck={answer} />
                  </motion.div>
                </motion.div>
              )}

              {feedback ? (
                <FeedbackBanner feedback={feedback} onAdvance={advance} />
              ) : current.kind === 'single' ? (
                <p className="text-ink-500 mt-4 hidden text-xs sm:block">
                  Nhấn phím <kbd className="border-ink-600 rounded border px-1">1</kbd>–
                  <kbd className="border-ink-600 rounded border px-1">{current.options.length}</kbd>{' '}
                  để chọn đáp án.
                </p>
              ) : null}
            </div>
          )}
        </main>

        {/* ── Account ─────────────────────────────────────────────────── */}
        <footer className="border-ink-600/50 border-t backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3">
            <UserMenu
              placement="top"
              align="start"
              size="sm"
              guestJoin
              dataCy="endless-user"
              className="min-w-0 shrink"
            />

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <Link
                to="/leaderboard"
                data-cy="endless-highscore"
                className="border-spark-400/40 bg-spark-400/10 text-spark-300 hover:border-spark-400/70 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap tabular-nums transition-colors"
                title="Chuỗi trả lời đúng dài nhất trong phiên này · Xem bảng xếp hạng"
              >
                <Trophy className="size-3.5" aria-hidden />
                Kỷ lục
                <span
                  key={stats.bestStreak}
                  data-cy="endless-highscore-value"
                  className="text-ink-50 animate-pop inline-block font-semibold"
                >
                  {stats.bestStreak}
                </span>
                <ChevronRight className="-mr-1 size-3.5 opacity-70" aria-hidden />
              </Link>
            </div>
          </div>
        </footer>
      </div>

      {/* ── Summaries, and the ad break on the way out of one ─────────── */}
      {adBefore ? (
        <AdBreak continueLabel={adBefore === 'nextRound' ? 'Vào vòng tiếp theo' : 'Chơi tiếp'} onContinue={afterAd} />
      ) : phase === 'roundEnd' ? (
        <RoundSummary
          round={round}
          answers={history.slice(roundStart)}
          streak={stats.streak}
          bestStreak={stats.bestStreak}
          onNext={() => carryOn('nextRound')}
          onStop={stop}
        />
      ) : phase === 'stopped' ? (
        <StopSummary
          stats={stats}
          rounds={Math.floor(roundStart / ROUND_SIZE)}
          unreviewed={history.slice(roundStart)}
          areas={areas}
          seconds={seconds}
          onRestart={() => carryOn('restart')}
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
              <Button onClick={restartRun}>
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

      {/* ── Subject scope ────────────────────────────────────────────── */}
      <Modal
        open={scopeOpen}
        onClose={() => setScopeOpen(false)}
        icon={Layers}
        tone="violet"
        title="Chọn môn học"
        description="Chọn lớp, môn rồi chủ đề — hoặc trộn tất cả."
      >
        <TopicScopePicker
          topics={topics}
          activeSlug={topicSlug}
          onSelect={(slug) => {
            onScopeChange(slug)
            setScopeOpen(false)
          }}
        />
      </Modal>
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

/**
 * True/false and short-answer questions: the player builds an answer, then
 * checks it. Once graded the same inputs show the key. Mounted per question
 * (the parent is keyed by its id), so marks and text never leak into the next.
 */
function CheckedAnswer({
  question,
  feedback,
  disabled,
  onCheck,
}: {
  question: EndlessQuestion
  feedback: EndlessGrade | null
  disabled: boolean
  onCheck: (answer: EndlessAnswer) => void
}) {
  const [marks, setMarks] = useState<Record<string, boolean>>({})
  const [text, setText] = useState('')

  if (question.kind === 'true_false') {
    const truth = new Map((feedback?.key ?? []).map((option) => [option.id, option.is_correct]))
    const complete = question.options.every((option) => typeof marks[option.id] === 'boolean')

    return (
      <div>
        <p className="text-ink-400 mb-3 text-xs">Đánh dấu từng mệnh đề là Đúng hay Sai.</p>
        <div className="space-y-2.5 sm:space-y-3">
          {question.options.map((option, index) => (
            <TrueFalseStatement
              key={option.id}
              letter={optionLetter(index)}
              label={option.label}
              value={marks[option.id]}
              onChange={(value) => setMarks((previous) => ({ ...previous, [option.id]: value }))}
              truth={feedback ? truth.get(option.id) : undefined}
              disabled={disabled}
            />
          ))}
        </div>
        {feedback ? null : (
          <Button
            className="mt-4 w-full sm:w-auto"
            disabled={!complete || disabled}
            loading={disabled}
            onClick={() => onCheck({ marks })}
            data-cy="endless-check"
          >
            Kiểm tra
          </Button>
        )}
      </div>
    )
  }

  if (feedback) {
    return <ShortAnswerResult text={feedback.text} isCorrect={feedback.is_correct} accepted={feedback.key ?? []} />
  }

  const submit = () => {
    if (text.trim() && !disabled) onCheck({ text })
  }

  return (
    <div>
      <ShortAnswerInput value={text} onChange={setText} onEnter={submit} disabled={disabled} autoFocus />
      <Button
        className="mt-3 w-full sm:w-auto"
        disabled={!text.trim() || disabled}
        loading={disabled}
        onClick={submit}
        data-cy="endless-check"
      >
        Kiểm tra
      </Button>
    </div>
  )
}

/** A graded short answer: what was typed, marked right or wrong, and what would have counted. */
function ShortAnswerResult({
  text,
  isCorrect,
  accepted,
}: {
  text: string | null
  isCorrect: boolean
  accepted: { label: string }[]
}) {
  return (
    <dl className="space-y-2 text-sm">
      <div
        className="answer-tile flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
        data-state={isCorrect ? 'correct' : 'wrong'}
      >
        <dt className="text-ink-400 text-xs">Bạn trả lời</dt>
        <dd className="text-ink-50 font-medium">{text ?? '—'}</dd>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
        <dt className="text-ink-400 text-xs">{accepted.length > 1 ? 'Đáp án được chấp nhận' : 'Đáp án'}</dt>
        <dd className="text-correct-300 font-medium">{accepted.map((option) => option.label).join(' · ')}</dd>
      </div>
    </dl>
  )
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
      data-cy="endless-feedback"
      className={cn(
        'animate-feedback-in mt-4 rounded-2xl border p-3.5 sm:mt-5 sm:p-4',
        feedback.is_correct
          ? 'border-correct-400/40 bg-correct-500/10'
          : 'border-wrong-400/40 bg-wrong-500/10',
      )}
      role="status"
    >
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
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
          // On phones the button drops to its own row, so the explanation keeps the full width.
          className="ml-auto shrink-0 max-sm:basis-full"
        >
          Tiếp
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

function StatPill({
  icon: Icon,
  tone = 'neutral',
  className,
  dataCy,
  children,
}: {
  icon: typeof Flame
  tone?: 'neutral' | 'spark' | 'neon'
  className?: string
  dataCy?: string
  children: ReactNode
}) {
  const tones = {
    neutral: 'border-ink-600 bg-ink-800/70 text-ink-100',
    spark: 'border-spark-400/40 bg-spark-400/10 text-spark-300',
    neon: 'border-neon-400/40 bg-neon-400/10 text-neon-300',
  } as const

  return (
    <span
      data-cy={dataCy}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium whitespace-nowrap tabular-nums sm:gap-1.5 sm:px-2.5',
        tones[tone],
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {children}
    </span>
  )
}

/** Topics the stop summary lists before "Xem tất cả". */
const AREAS_SHOWN = 3

/** An ad break is due once this many rounds' worth of answers have come in since the last one. */
const ADS_EVERY_ROUNDS = 2

/**
 * The frame both summaries share. Fits the screen: the header, stats and
 * buttons stay put and only the middle scrolls. A full-screen sheet on a phone,
 * a centred card from sm up.
 */
function SummarySheet({
  dataCy,
  wide,
  icon: Icon,
  title,
  subtitle,
  stats,
  footer,
  children,
}: {
  dataCy: string
  /** Room for an answer review. */
  wide: boolean
  icon: typeof Sparkles
  title: ReactNode
  subtitle: ReactNode
  stats: ReactNode
  footer: ReactNode
  children: ReactNode
}) {
  return (
    <div className="bg-ink-950/85 fixed inset-0 z-50 flex items-center justify-center backdrop-blur sm:p-5">
      <Card
        data-cy={dataCy}
        className={cn(
          'animate-pop flex h-full w-full flex-col rounded-none sm:h-auto sm:max-h-full sm:rounded-2xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <div className="shrink-0 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6">
          <div className="flex items-center gap-3">
            <span className="border-neon-400/40 bg-neon-400/10 text-neon-300 flex size-9 items-center justify-center rounded-xl border sm:size-11 sm:rounded-2xl">
              <Icon className="size-4 sm:size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-display text-ink-50 text-lg font-semibold">{title}</h2>
              <p className="text-ink-400 text-sm">{subtitle}</p>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-4 gap-2 sm:mt-6 sm:gap-3">{stats}</dl>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-1 sm:px-6" data-cy="endless-summary-scroll">
          {children}
        </div>

        <div className="border-ink-600/60 flex shrink-0 items-center gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:gap-3 sm:px-6 sm:py-4">
          {footer}
        </div>
      </Card>
    </div>
  )
}

/** A round's last answer is in: how it went, its answers, and on to the next. */
function RoundSummary({
  round,
  answers,
  streak,
  bestStreak,
  onNext,
  onStop,
}: {
  round: number
  answers: EndlessAnswered[]
  streak: number
  bestStreak: number
  onNext: () => void
  onStop: () => void
}) {
  const correct = answers.filter((item) => item.grade.is_correct).length
  const accuracy = answers.length === 0 ? 0 : (correct / answers.length) * 100
  const cheer =
    accuracy >= 80 ? 'Xuất sắc!' : accuracy >= 50 ? 'Làm tốt lắm!' : 'Xem lại các câu sai rồi thử vòng tiếp nhé.'

  return (
    <SummarySheet
      dataCy="endless-round-summary"
      wide
      icon={Trophy}
      title={`Hoàn thành vòng ${round}`}
      subtitle={cheer}
      stats={
        <>
          <SummaryStat label="Đúng" value={`${correct}/${answers.length}`} tone="correct" />
          <SummaryStat label="Chính xác" value={formatPercent(accuracy)} />
          <SummaryStat label="Chuỗi hiện tại" value={streak} tone="spark" />
          <SummaryStat label="Chuỗi dài nhất" value={bestStreak} tone="spark" />
        </>
      }
      footer={
        <>
          <Button onClick={onNext} className="flex-1 sm:flex-none" data-cy="endless-next-round">
            Vòng tiếp theo
            <ArrowRight className="size-4" aria-hidden />
          </Button>
          <Button variant="outline" onClick={onStop} data-cy="endless-round-stop">
            <Pause className="size-4" aria-hidden />
            Dừng
          </Button>
        </>
      }
    >
      <AnswerReview history={answers} title={`Xem lại vòng ${round}`} />
    </SummarySheet>
  )
}

/**
 * The end of the run. The totals cover every round; the review only covers the
 * unfinished one, since each finished round was reviewed in its own summary.
 */
function StopSummary({
  stats,
  rounds,
  unreviewed,
  areas,
  seconds,
  onRestart,
}: {
  stats: { answered: number; correct: number; bestStreak: number }
  /** Rounds finished this run. */
  rounds: number
  /** Answers of the round the player stopped in. */
  unreviewed: EndlessAnswered[]
  areas: EndlessTopicProgress[]
  seconds: number
  onRestart: () => void
}) {
  const accuracy = stats.answered === 0 ? 0 : (stats.correct / stats.answered) * 100

  return (
    <SummarySheet
      dataCy="endless-summary"
      wide={unreviewed.length > 0}
      icon={Sparkles}
      title="Phiên luyện tập"
      subtitle={
        <>
          Bạn đã dừng sau {formatClock(seconds)}
          {rounds > 0 ? ` · hoàn thành ${rounds} vòng` : ''}.
        </>
      }
      stats={
        <>
          <SummaryStat label="Đã làm" value={stats.answered} />
          <SummaryStat label="Đúng" value={stats.correct} tone="correct" />
          <SummaryStat label="Chính xác" value={formatPercent(accuracy)} />
          <SummaryStat label="Chuỗi dài nhất" value={stats.bestStreak} tone="spark" />
        </>
      }
      footer={
        <>
          <Button onClick={onRestart} className="flex-1 sm:flex-none">
            <RotateCcw className="size-4" aria-hidden />
            Chơi tiếp
          </Button>
          <ButtonLink to="/" variant="outline" aria-label="Trang chủ">
            <Home className="size-4" aria-hidden />
            <span className="hidden sm:inline">Trang chủ</span>
          </ButtonLink>
          <ButtonLink to="/progress" variant="ghost" className="px-3 sm:px-4">
            Tiến độ
          </ButtonLink>
        </>
      }
    >
      <SkillProfile areas={areas} />
      {unreviewed.length > 0 ? (
        <AnswerReview history={unreviewed} title={rounds > 0 ? `Xem lại vòng ${rounds + 1}` : undefined} />
      ) : null}
    </SummarySheet>
  )
}

/** Every topic touched in Endless, all-time; the strongest few, the rest behind a toggle. */
function SkillProfile({ areas }: { areas: EndlessTopicProgress[] }) {
  // The strongest few are enough to read the profile; the rest would push the review out of reach.
  const [showAllAreas, setShowAllAreas] = useState(false)

  return areas.length > 0 ? (
    <div className="border-ink-600/60 mt-4 border-t pt-4 sm:mt-6 sm:pt-5">
      <p className="text-ink-400 text-[0.7rem] font-medium tracking-[0.16em] uppercase">
        Hồ sơ năng lực
      </p>
      <p className="text-ink-400 mt-1 text-xs">
        Số câu đúng trên số câu đã trả lời ở chế độ vô tận, tính từ trước đến nay. Cần ít nhất{' '}
        {MIN_ANSWERED} câu để xếp loại.
      </p>
      <TopicProgressList className="mt-3" areas={showAllAreas ? areas : areas.slice(0, AREAS_SHOWN)} />
      {areas.length > AREAS_SHOWN ? (
        <button
          type="button"
          onClick={() => setShowAllAreas((value) => !value)}
          aria-expanded={showAllAreas}
          className="text-neon-300 hover:text-neon-200 mt-3 text-xs font-medium"
          data-cy="endless-areas-toggle"
        >
          {showAllAreas ? 'Thu gọn' : `Xem tất cả ${areas.length} chủ đề`}
        </button>
      ) : null}
    </div>
  ) : null
}

/**
 * Every answer of the session, newest first, the way the quiz result reviews
 * them: the pick, the right option and the explanation. "Câu sai" narrows it
 * to the misses, which is usually what is worth rereading.
 */
function AnswerReview({ history, title = 'Xem lại câu trả lời' }: { history: EndlessAnswered[]; title?: string }) {
  const missed = history.filter((item) => !item.grade.is_correct).length
  const [onlyMissed, setOnlyMissed] = useState(false)
  const items = history
    .map((item, index) => ({ ...item, number: index + 1 }))
    .filter((item) => !onlyMissed || !item.grade.is_correct)
    .reverse()

  return (
    <div className="border-ink-600/60 mt-6 border-t" data-cy="endless-review">
      <div className="bg-ink-900/95 sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <p className="text-ink-400 text-[0.7rem] font-medium tracking-[0.16em] uppercase">{title}</p>
        <div className="flex gap-1.5" role="group" aria-label="Lọc câu trả lời">
          {[
            { value: false, label: `Tất cả (${history.length})` },
            { value: true, label: `Câu sai (${missed})` },
          ].map((filter) => (
            <button
              key={filter.label}
              type="button"
              aria-pressed={onlyMissed === filter.value}
              onClick={() => setOnlyMissed(filter.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                onlyMissed === filter.value
                  ? 'border-neon-400/50 bg-neon-400/10 text-neon-300'
                  : 'border-ink-600/70 text-ink-300 hover:text-ink-50',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-ink-300 mt-2 pb-4 text-sm">Không có câu nào sai. Tuyệt vời!</p>
      ) : (
        <ol className="mt-2 space-y-5 pb-4">
          {items.map(({ question, grade, number }) => (
            <li key={`${question.id}-${number}`} className="flex gap-3">
              <span
                className={cn(
                  'mt-0.5 hidden size-7 shrink-0 items-center justify-center rounded-lg sm:flex',
                  grade.is_correct ? 'bg-correct-500/15 text-correct-300' : 'bg-wrong-500/15 text-wrong-300',
                )}
                aria-label={grade.is_correct ? 'Đúng' : 'Sai'}
              >
                {grade.is_correct ? <CheckCircle2 className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-ink-50 text-sm leading-relaxed font-medium">
                  {grade.is_correct ? (
                    <CheckCircle2 className="text-correct-300 mr-1.5 -mt-0.5 inline size-4 sm:hidden" aria-hidden />
                  ) : (
                    <XCircle className="text-wrong-300 mr-1.5 -mt-0.5 inline size-4 sm:hidden" aria-hidden />
                  )}
                  <span className="text-ink-400 mr-2 tabular-nums">Câu {number}.</span>
                  {question.prompt}
                </p>

                <div className="mt-3 space-y-2">
                  {grade.kind === 'true_false' ? (
                    (grade.key ?? []).map((option, index) => (
                      <TrueFalseStatement
                        key={option.id}
                        letter={optionLetter(index)}
                        label={option.label}
                        value={grade.marks?.[option.id]}
                        truth={option.is_correct}
                      />
                    ))
                  ) : grade.kind === 'short_answer' ? (
                    <ShortAnswerResult text={grade.text} isCorrect={grade.is_correct} accepted={grade.key ?? []} />
                  ) : (
                    question.options.map((option, index) => (
                      <AnswerTile
                        key={option.id}
                        letter={optionLetter(index)}
                        label={option.label}
                        state={
                          option.id === grade.correct_option_id ? 'correct' : option.id === grade.option_id ? 'wrong' : 'dim'
                        }
                        disabled
                        className="py-2.5"
                      />
                    ))
                  )}
                </div>

                {grade.explanation ? (
                  <div className="border-ink-600/60 bg-ink-800/50 mt-3 rounded-xl border p-3.5">
                    <p className="text-ink-400 text-[0.7rem] font-semibold tracking-[0.16em] uppercase">Lời giải</p>
                    <p className="text-ink-200 mt-1.5 text-sm leading-relaxed">{grade.explanation}</p>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
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
    <div className="bg-ink-800/60 flex flex-col justify-between rounded-xl border border-ink-600/60 px-2 py-2 sm:px-3 sm:py-3">
      <dt className="text-ink-400 text-[0.6rem] leading-tight font-medium tracking-[0.06em] uppercase sm:text-[0.65rem] sm:tracking-[0.14em]">
        {label}
      </dt>
      <dd className={cn('font-display mt-1 text-lg font-semibold tabular-nums sm:text-xl', tones[tone])}>
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
