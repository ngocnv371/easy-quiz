import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  isAnswered,
  type AnswerSubmission,
  type PlayPayload,
  type PlayQuestion,
  type PlayerAnswer,
} from '@/lib/domain'
import { seededShuffle } from '@/lib/utils'

export type PlayPhase = 'idle' | 'countdown' | 'playing' | 'submitting' | 'error'

export interface PlaySession {
  phase: PlayPhase
  /** Questions in the order this player will see them. */
  questions: PlayQuestion[]
  index: number
  current: PlayQuestion | null
  answers: Record<string, PlayerAnswer>
  answeredCount: number
  /** Seconds remaining on the whole quiz, or null when there is no limit. */
  secondsLeft: number | null
  elapsedSeconds: number
  progress: number
  error: string | null
  /** One submission per question, in the order the player saw them. */
  buildSubmission: () => AnswerSubmission[]
  start: () => void
  /** Called when the countdown composition finishes, to open question one. */
  beginQuestions: () => void
  select: (optionId: string) => void
  /** True/false: mark one statement. */
  mark: (optionId: string, value: boolean) => void
  /** Short answer: the text typed so far. */
  type: (text: string) => void
  next: () => void
  previous: () => void
  goTo: (index: number) => void
  markSubmitting: () => void
  fail: (message: string) => void
}

/**
 * The quiz player's state machine.
 *
 * Three decisions worth calling out:
 *  · Shuffling is seeded per session, so a re-render never reorders the answers
 *    under the player's finger.
 *  · Time is tracked per question and sent along with the answer, which is what
 *    makes a "nhanh nhất" tiebreak possible later.
 *  · Nothing is graded here. The server does that on submit; this hook only
 *    records what was chosen.
 */
export function usePlaySession(payload: PlayPayload | null): PlaySession {
  const [phase, setPhase] = useState<PlayPhase>('idle')
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, PlayerAnswer>>({})
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // A fresh seed per play session, so two runs of the same quiz differ.
  // Lazy `useState` keeps the impure call out of render.
  const [seed] = useState(() => Math.random().toString(36).slice(2))

  const questions = useMemo<PlayQuestion[]>(() => {
    if (!payload) return []

    const prepared = payload.questions.map((question) => ({
      ...question,
      options: payload.quiz.shuffle_options
        ? seededShuffle(question.options, `${seed}:${question.id}`)
        : question.options,
    }))

    return payload.quiz.shuffle_questions
      ? seededShuffle(prepared, `${seed}:order`)
      : prepared
  }, [payload, seed])

  // Per-question time. A ref, because it must not trigger a render on tick.
  const questionClockRef = useRef<number>(0)
  const timeSpentRef = useRef<Record<string, number>>({})

  const flushQuestionTime = useCallback(() => {
    if (questionClockRef.current === 0) return
    const question = questions[index]
    if (!question) return

    const spent = Date.now() - questionClockRef.current
    timeSpentRef.current[question.id] = (timeSpentRef.current[question.id] ?? 0) + spent
    questionClockRef.current = Date.now()
  }, [index, questions])

  // ── Clocks ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return

    const timer = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1)
      setSecondsLeft((value) => (value === null ? null : Math.max(0, value - 1)))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [phase])

  const total = questions.length

  const buildSubmission = useCallback((): AnswerSubmission[] => {
    flushQuestionTime()

    return questions.map((question) => {
      const answer = answers[question.id]
      return {
        question_id: question.id,
        option_id: answer?.option_id ?? null,
        ...(answer?.marks ? { marks: answer.marks } : {}),
        ...(answer?.text ? { text: answer.text } : {}),
        time_ms: Math.round(timeSpentRef.current[question.id] ?? 0),
      }
    })
  }, [answers, flushQuestionTime, questions])

  const start = useCallback(() => {
    setIndex(0)
    setAnswers({})
    setElapsedSeconds(0)
    setError(null)
    setPhase('countdown')

    const limit = payload?.quiz.time_limit_seconds ?? 0
    setSecondsLeft(limit > 0 ? limit : null)
  }, [payload])

  // The countdown composition runs for a fixed wall-clock time; hand over to
  // the first question when it finishes.
  const beginQuestions = useCallback(() => {
    questionClockRef.current = Date.now()
    setPhase('playing')
  }, [])

  const answerCurrent = useCallback(
    (update: (previous: PlayerAnswer | undefined) => PlayerAnswer) => {
      const question = questions[index]
      if (!question) return

      setAnswers((previous) => ({ ...previous, [question.id]: update(previous[question.id]) }))
    },
    [index, questions],
  )

  const select = useCallback(
    (optionId: string) => answerCurrent(() => ({ option_id: optionId })),
    [answerCurrent],
  )

  const mark = useCallback(
    (optionId: string, value: boolean) =>
      answerCurrent((previous) => ({ marks: { ...previous?.marks, [optionId]: value } })),
    [answerCurrent],
  )

  const type = useCallback(
    (text: string) => answerCurrent(() => ({ text })),
    [answerCurrent],
  )

  const goTo = useCallback(
    (nextIndex: number) => {
      flushQuestionTime()
      setIndex(Math.max(0, Math.min(total - 1, nextIndex)))
    },
    [flushQuestionTime, total],
  )

  const next = useCallback(() => goTo(index + 1), [goTo, index])
  const previous = useCallback(() => goTo(index - 1), [goTo, index])

  const markSubmitting = useCallback(() => setPhase('submitting'), [])

  const fail = useCallback((message: string) => {
    setError(message)
    setPhase('error')
  }, [])

  const answeredCount = questions.filter((question) =>
    isAnswered(question, answers[question.id]),
  ).length

  return {
    phase,
    questions,
    index,
    current: questions[index] ?? null,
    answers,
    answeredCount,
    secondsLeft,
    elapsedSeconds,
    progress: total === 0 ? 0 : (index + 1) / total,
    error,
    buildSubmission,
    start,
    beginQuestions,
    select,
    mark,
    type,
    next,
    previous,
    goTo,
    markSubmitting,
    fail,
  }
}

/** The countdown composition's wall-clock length, in milliseconds. */
export const COUNTDOWN_MS = 3 * 1000 + 1400
