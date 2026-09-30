import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Flag,
  LogIn,
  Play,
  Timer,
  UserRound,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { EasyQuizLogo } from '@/components/brand/logo'
import { QuizIntroVideo } from '@/components/remotion/players'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink, Spinner } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/field'
import { ProgressBar } from '@/components/ui/metrics'
import { AnswerTile, optionLetter } from '@/features/quiz/answer-tile'
import { fetchPlayPayload, submitAttempt } from '@/features/quiz/api'
import { stashResult } from '@/features/quiz/result-store'
import { COUNTDOWN_MS, usePlaySession } from '@/features/quiz/use-play-session'
import { useAuth } from '@/features/auth/auth-context'
import { formatClock } from '@/lib/format'
import { usePageMeta } from '@/lib/seo'
import { useAsyncData } from '@/lib/use-async-data'
import { cn, errorMessage } from '@/lib/utils'

export function QuizPlayPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const { user, status, isConfigured, signInAsGuest, displayName } = useAuth()

  const query = useAsyncData(
    `play:${slug}`,
    () => fetchPlayPayload(slug),
    isConfigured && slug !== '',
  )

  // The player is a sub-view of the quiz, so the canonical points at the detail
  // page — the two URLs should not compete in search results.
  usePageMeta({
    title: query.data ? `${query.data.quiz.title} — Làm bài` : 'Làm bài trắc nghiệm',
    description: query.data?.quiz.description ?? undefined,
    path: `/q/${slug}`,
  })

  // Held in state so the session hook sees a stable object identity.
  const [payload, setPayload] = useState(query.data)
  useEffect(() => {
    if (query.data) setPayload(query.data)
  }, [query.data])

  const session = usePlaySession(payload)
  const { phase, current, index, questions, answers, answeredCount, secondsLeft } = session

  const [guestName, setGuestName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [confirmQuit, setConfirmQuit] = useState(false)

  const selectedOptionId = current ? answers[current.id] : undefined

  // ── Countdown → first question ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return

    const timer = window.setTimeout(() => session.beginQuestions(), COUNTDOWN_MS)
    return () => window.clearTimeout(timer)
  }, [phase, session])

  // ── Submitting ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!payload) return

    session.markSubmitting()

    try {
      const result = await submitAttempt({
        slug: payload.quiz.slug,
        answers: session.buildSubmission(),
        durationSeconds: session.elapsedSeconds,
        guestName: displayName,
      })

      stashResult(result)
      navigate(`/q/${payload.quiz.slug}/result/${result.attempt.id}`, { replace: true })
    } catch (error) {
      const message = errorMessage(error)
      session.fail(message)
      toast.error(message)
    }
  }, [displayName, navigate, payload, session])

  // Time-up submits automatically rather than losing the run.
  useEffect(() => {
    if (phase === 'playing' && secondsLeft === 0) {
      toast.warning('Hết giờ! Bài của bạn được nộp tự động.')
      void handleSubmit()
    }
  }, [phase, secondsLeft, handleSubmit])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing' || !current) return

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      const number = Number.parseInt(event.key, 10)

      if (Number.isInteger(number) && number >= 1 && number <= current.options.length) {
        const option = current.options[number - 1]
        if (option) {
          event.preventDefault()
          session.select(option.id)
        }
        return
      }

      if (event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault()
        if (index === questions.length - 1) void handleSubmit()
        else session.next()
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        session.previous()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase, current, index, questions.length, session, handleSubmit])

  // Warn before a refresh or tab close throws away an in-progress attempt.
  useEffect(() => {
    if (phase !== 'playing') return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [phase])

  const handleStart = async () => {
    setNameError(null)

    // A guest needs an identity before the server will accept a submission.
    if (!user) {
      const trimmed = guestName.trim()
      if (trimmed.length < 2) {
        setNameError('Hãy nhập tên hiển thị (ít nhất 2 ký tự) để lên bảng xếp hạng.')
        return
      }

      setPreparing(true)
      try {
        await signInAsGuest(trimmed)
      } catch (error) {
        setNameError(errorMessage(error))
        setPreparing(false)
        return
      }
      setPreparing(false)
    }

    session.start()
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (!isConfigured) {
    return (
      <PlayShell>
        <EmptyState
          icon={AlertTriangle}
          title="Chưa kết nối Supabase"
          description="Trình chơi cần máy chủ để chấm điểm. Hãy cấu hình .env.local rồi thử lại."
          action={<ButtonLink to="/explore">Về thư viện</ButtonLink>}
        />
      </PlayShell>
    )
  }

  if (query.loading || status === 'loading') {
    return (
      <PlayShell>
        <Card className="mx-auto max-w-3xl p-8">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-5 h-7 w-3/4" />
          <Skeleton className="mt-3 h-4 w-full" />
          <div className="mt-8 space-y-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-2xl" />
            ))}
          </div>
        </Card>
      </PlayShell>
    )
  }

  if (!payload) {
    return (
      <PlayShell>
        <EmptyState
          icon={AlertTriangle}
          title="Đề thi này chưa mở"
          description="Có thể đề đang ở bản nháp, đã bị ẩn, hoặc đường dẫn không còn đúng."
          action={<ButtonLink to="/explore">Tìm đề khác</ButtonLink>}
        />
      </PlayShell>
    )
  }

  if (phase === 'countdown') {
    return (
      <div className="bg-ink-950 fixed inset-0 z-50">
        <QuizIntroVideo
          title={payload.quiz.title}
          questionCount={payload.questions.length}
          topicName={payload.quiz.topic?.name ?? null}
          seconds={3}
        />
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <PlayShell>
        <Alert tone="error" icon={AlertTriangle} title="Không nộp được bài">
          {session.error}
        </Alert>
        <div className="mt-6 flex gap-3">
          <Button onClick={() => void handleSubmit()}>Thử nộp lại</Button>
          <ButtonLink to={`/q/${payload.quiz.slug}`} variant="outline">
            Về trang đề thi
          </ButtonLink>
        </div>
      </PlayShell>
    )
  }

  // ── Start screen ──────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <PlayShell>
        <div className="mx-auto max-w-2xl">
          <Card className="p-6 sm:p-8">
            <div className="flex items-start gap-5">
              <span
                className="border-ink-600 bg-ink-800/70 flex size-14 items-center justify-center rounded-2xl border text-2xl"
                aria-hidden
              >
                {payload.quiz.cover_emoji}
              </span>

              <div className="min-w-0 flex-1">
                <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                  {payload.quiz.title}
                </h1>
                {payload.quiz.description ? (
                  <p className="text-ink-300 mt-2 text-sm leading-relaxed">
                    {payload.quiz.description}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {payload.quiz.topic ? (
                <Badge tone="neon">
                  <span aria-hidden>{payload.quiz.topic.emoji}</span>
                  {payload.quiz.topic.name}
                </Badge>
              ) : null}
              <Badge tone="neutral">{payload.questions.length} câu hỏi</Badge>
              <Badge tone={payload.quiz.time_limit_seconds > 0 ? 'spark' : 'correct'}>
                {payload.quiz.time_limit_seconds > 0
                  ? `⏱ ${formatClock(payload.quiz.time_limit_seconds)}`
                  : 'Không giới hạn thời gian'}
              </Badge>
            </div>

            <ul className="text-ink-300 border-ink-600/60 mt-6 space-y-2.5 border-t pt-6 text-sm">
              <li className="flex gap-2.5">
                <CheckCircle2 className="text-correct-400 mt-0.5 size-4 shrink-0" aria-hidden />
                Đáp án được chấm trên máy chủ sau khi bạn nộp — không thể gian lận điểm.
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2 className="text-correct-400 mt-0.5 size-4 shrink-0" aria-hidden />
                Có thể quay lại câu trước để đổi đáp án.
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2 className="text-correct-400 mt-0.5 size-4 shrink-0" aria-hidden />
                Sau khi nộp, bạn xem lại từng câu kèm lời giải.
              </li>
            </ul>

            {!user ? (
              <div className="border-ink-600/60 mt-6 border-t pt-6">
                <Field
                  label="Tên hiển thị của bạn"
                  htmlFor="guest-name"
                  error={nameError}
                  hint="Tên này sẽ xuất hiện trên bảng xếp hạng. Bạn có thể tạo tài khoản sau để giữ thành tích."
                >
                  <div className="relative">
                    <UserRound
                      className="text-ink-400 pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
                      aria-hidden
                    />
                    <Input
                      id="guest-name"
                      value={guestName}
                      onChange={(event) => setGuestName(event.target.value)}
                      placeholder="Ví dụ: Ngọc Anh"
                      maxLength={60}
                      className="pl-10"
                    />
                  </div>
                </Field>

                <p className="text-ink-400 mt-3 text-xs">
                  Đã có tài khoản?{' '}
                  <Link
                    to={`/login?redirect=${encodeURIComponent(`/q/${payload.quiz.slug}/play`)}`}
                    className="text-neon-300 hover:underline"
                  >
                    Đăng nhập để lưu vào hồ sơ
                  </Link>
                </p>
              </div>
            ) : (
              <p className="text-ink-400 mt-6 text-sm">
                Sẵn sàng chưa, <span className="text-ink-100 font-medium">{displayName}</span>?
              </p>
            )}

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => void handleStart()} loading={preparing}>
                {preparing ? null : <Play className="size-4" aria-hidden />}
                Bắt đầu làm bài
              </Button>

              <ButtonLink to={`/q/${payload.quiz.slug}`} variant="ghost" size="lg">
                Xem thông tin đề
              </ButtonLink>

              {!user ? (
                <ButtonLink to="/login" variant="outline" size="lg">
                  <LogIn className="size-4" aria-hidden />
                  Đăng nhập
                </ButtonLink>
              ) : null}
            </div>
          </Card>
        </div>
      </PlayShell>
    )
  }

  // ── Playing ───────────────────────────────────────────────────────────
  if (!current) {
    return (
      <PlayShell>
        <EmptyState
          icon={AlertTriangle}
          title="Đề thi chưa có câu hỏi"
          description="Hãy báo cho giáo viên biết để bổ sung nội dung."
        />
      </PlayShell>
    )
  }

  const isLast = index === questions.length - 1
  const submitting = phase === 'submitting'
  const timeCritical = secondsLeft !== null && secondsLeft <= 30

  return (
    <div className="bg-ink-950 relative flex min-h-dvh flex-col">
      <AuroraBackground grid={false} variant="quiz" />

      <div className="relative flex min-h-dvh flex-col">
        {/* ── Top bar ──────────────────────────────────────────────── */}
        <header className="border-ink-600/50 border-b backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-4xl items-center gap-4 px-5 py-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmQuit(true)}
              className="shrink-0"
            >
              <X className="size-4" aria-hidden />
              Thoát
            </Button>

            <div className="min-w-0 flex-1">
              <p className="text-ink-400 text-xs">
                Câu {index + 1} / {questions.length} · đã trả lời {answeredCount}
              </p>
              <p className="text-ink-100 truncate text-sm font-medium">
                {payload.quiz.cover_emoji} {payload.quiz.title}
              </p>
            </div>

            {secondsLeft !== null ? (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 font-mono text-sm tabular-nums transition-colors',
                  timeCritical
                    ? 'border-wrong-400/60 bg-wrong-500/15 text-wrong-300 animate-pulse'
                    : 'border-ink-600 bg-ink-800/70 text-ink-100',
                )}
                role="timer"
                aria-live={timeCritical ? 'assertive' : 'off'}
              >
                <Timer className="size-3.5" aria-hidden />
                {formatClock(secondsLeft)}
              </span>
            ) : (
              <span className="text-ink-400 shrink-0 font-mono text-sm tabular-nums">
                {formatClock(session.elapsedSeconds)}
              </span>
            )}
          </div>

          <ProgressBar
            percent={session.progress * 100}
            className="h-1 rounded-none"
            barClassName="rounded-none"
          />
        </header>

        {/* ── Question ─────────────────────────────────────────────── */}
        <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">
          <div key={current.id} className="animate-rise">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neon">Câu {index + 1}</Badge>
              <Badge tone="neutral">{current.points} điểm</Badge>
              {current.time_limit_seconds ? (
                <Badge tone="spark">⏱ {current.time_limit_seconds}s</Badge>
              ) : null}
            </div>

            <h2 className="font-display text-ink-50 mt-5 text-xl leading-snug font-semibold sm:text-2xl">
              {current.prompt}
            </h2>

            {current.image_url ? (
              <img
                src={current.image_url}
                alt=""
                className="border-ink-600/60 mt-5 max-h-72 w-full rounded-2xl border object-contain"
              />
            ) : null}

            <div className="mt-7 space-y-3">
              {current.options.map((option, optionIndex) => (
                <AnswerTile
                  key={option.id}
                  letter={optionLetter(optionIndex)}
                  label={option.label}
                  state={selectedOptionId === option.id ? 'selected' : 'idle'}
                  disabled={submitting}
                  onClick={() => session.select(option.id)}
                />
              ))}
            </div>

            <p className="text-ink-500 mt-4 hidden text-xs sm:block">
              Mẹo: nhấn phím <kbd className="border-ink-600 rounded border px-1">1</kbd>–
              <kbd className="border-ink-600 rounded border px-1">{current.options.length}</kbd> để
              chọn, <kbd className="border-ink-600 rounded border px-1">←</kbd>{' '}
              <kbd className="border-ink-600 rounded border px-1">→</kbd> để chuyển câu.
            </p>
          </div>
        </main>

        {/* ── Bottom bar ───────────────────────────────────────────── */}
        <footer className="border-ink-600/50 border-t backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-5 py-4">
            <Button
              variant="outline"
              onClick={session.previous}
              disabled={index === 0 || submitting}
            >
              <ArrowLeft className="size-4" aria-hidden />
              Câu trước
            </Button>

            <div className="text-ink-400 ml-auto hidden text-xs sm:block">
              {answeredCount}/{questions.length} câu đã chọn
            </div>

            {isLast ? (
              <Button
                variant="spark"
                onClick={() => void handleSubmit()}
                loading={submitting}
                className="ml-auto sm:ml-0"
              >
                {submitting ? null : <Flag className="size-4" aria-hidden />}
                Nộp bài
              </Button>
            ) : (
              <Button onClick={session.next} disabled={submitting} className="ml-auto sm:ml-0">
                Câu tiếp
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        </footer>
      </div>

      {/* ── Quit confirmation ──────────────────────────────────────── */}
      {confirmQuit ? (
        <div className="bg-ink-950/80 fixed inset-0 z-50 flex items-center justify-center p-5 backdrop-blur">
          <Card className="w-full max-w-sm p-6">
            <h2 className="font-display text-ink-50 text-lg font-semibold">Thoát giữa chừng?</h2>
            <p className="text-ink-300 mt-2 text-sm leading-relaxed">
              Bài làm hiện tại sẽ không được lưu và không xuất hiện trên bảng xếp hạng.
            </p>

            <div className="mt-6 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmQuit(false)}>
                Ở lại
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => navigate(`/q/${payload.quiz.slug}`)}
              >
                Thoát
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {submitting ? (
        <div className="bg-ink-950/70 fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 backdrop-blur">
          <Spinner className="text-neon-400 size-8" />
          <p className="text-ink-200 text-sm">Đang chấm bài…</p>
        </div>
      ) : null}
    </div>
  )
}

function PlayShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <AuroraBackground variant="quiz" />

      <header className="relative border-b border-ink-600/50">
        <div className="mx-auto flex w-full max-w-4xl items-center px-5 py-4">
          <Link to="/explore" aria-label="Easy Quiz">
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
