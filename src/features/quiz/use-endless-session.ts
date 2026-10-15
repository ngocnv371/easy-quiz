import { useCallback, useEffect, useRef, useState } from 'react'

import type { EndlessGrade, EndlessQuestion, EndlessTopicProgress } from '@/lib/domain'
import { errorMessage } from '@/lib/utils'

import {
  ENDLESS_BATCH_SIZE,
  fetchEndlessBatch,
  gradeEndlessAnswer,
  startEndlessSession,
} from './endless-api'

export type EndlessPhase =
  | 'waiting'
  | 'loading'
  | 'playing'
  | 'grading'
  | 'stopped'
  | 'error'

export interface EndlessStats {
  answered: number
  correct: number
  /** Correct answers in a row, reset by a miss. */
  streak: number
  bestStreak: number
}

const EMPTY_STATS: EndlessStats = { answered: 0, correct: 0, streak: 0, bestStreak: 0 }

/** Pull the next batch once the buffer is this short. */
const PREFETCH_AT = 3

/** How long feedback lingers before the next question arrives, in ms. */
const ADVANCE_CORRECT_MS = 850
/** A miss gets longer, so the explanation has a chance to land. */
const ADVANCE_WRONG_MS = 2000

export interface EndlessSession {
  phase: EndlessPhase
  current: EndlessQuestion | null
  /** Questions buffered behind the current one. */
  queued: number
  /** How many questions have been shown, including the current one. */
  shown: number
  selected: string | null
  feedback: EndlessGrade | null
  stats: EndlessStats
  progress: EndlessTopicProgress[]
  error: string | null
  /** Wall-clock seconds spent in this session. */
  seconds: number
  /** True once the pool has no fresh questions left to offer. */
  exhausted: boolean
  selectOption: (optionId: string) => void
  advance: () => void
  stop: () => void
  restart: () => void
}

function mergeProgress(
  list: EndlessTopicProgress[],
  update: EndlessTopicProgress,
): EndlessTopicProgress[] {
  const index = list.findIndex((item) => item.topic_id === update.topic_id)
  if (index === -1) return [...list, update]

  const next = [...list]
  next[index] = update
  return next
}

/**
 * Endless mode's state machine.
 *
 * The shape is deliberately different from `usePlaySession`: there is no start
 * screen, no countdown and no finish line. A batch of questions is pulled up
 * front, the buffer is topped up before it runs dry, and each answer is graded
 * on its own so the next question can be chosen with the result in hand.
 *
 * `enabled` is false until the player has an identity, because the server will
 * only grade a signed-in answer — an anonymous guest is signed in too, just
 * disposable.
 */
export function useEndlessSession(
  enabled: boolean,
  /** When set, the stream only draws from this subject. */
  topicId: string | null = null,
): EndlessSession {
  const [phase, setPhase] = useState<EndlessPhase>('waiting')
  const [queue, setQueue] = useState<EndlessQuestion[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<EndlessGrade | null>(null)
  const [stats, setStats] = useState<EndlessStats>(EMPTY_STATS)
  const [progress, setProgress] = useState<EndlessTopicProgress[]>([])
  const [error, setError] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [exhausted, setExhausted] = useState(false)
  /** Advances only at a question boundary, so a mid-question re-render cannot
   * replay the entrance animation. */
  const [shown, setShown] = useState(0)

  const queueRef = useRef<EndlessQuestion[]>([])
  const phaseRef = useRef<EndlessPhase>('waiting')
  const fetchingRef = useRef(false)
  const exhaustedRef = useRef(false)
  /** Ids seen this session, so the stream does not repeat a question. */
  const seenRef = useRef<Set<string>>(new Set())
  const bootedRef = useRef(false)
  /** The server-side run id this session's answers are attributed to. */
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  /**
   * Ask the server for the next batch and append whatever is new. Returns how
   * many fresh questions arrived. Guarded so concurrent triggers collapse into
   * one request.
   */
  const fetchMore = useCallback(async (): Promise<number> => {
    if (fetchingRef.current || exhaustedRef.current) return 0

    fetchingRef.current = true
    try {
      const batch = await fetchEndlessBatch(ENDLESS_BATCH_SIZE, [...seenRef.current], topicId)

      if (batch.progress.length > 0) setProgress(batch.progress)

      const fresh = batch.questions.filter((question) => !seenRef.current.has(question.id))
      for (const question of fresh) seenRef.current.add(question.id)

      if (fresh.length === 0) {
        exhaustedRef.current = true
        setExhausted(true)
      } else {
        setQueue((previous) => [...previous, ...fresh])
      }

      return fresh.length
    } finally {
      fetchingRef.current = false
    }
  }, [topicId])

  /** Load the very first batch and open the first question. */
  const begin = useCallback(async () => {
    setPhase('loading')
    setError(null)

    try {
      // Best-effort: a run with no id still plays, it just never reaches the
      // leaderboard. The id is what lets the server score the session.
      sessionIdRef.current = await startEndlessSession(topicId).catch(() => null)
      await fetchMore()
      setPhase('playing')
    } catch (loadError) {
      setError(errorMessage(loadError))
      setPhase('error')
    }
  }, [fetchMore, topicId])

  // Boot once an identity exists.
  useEffect(() => {
    if (!enabled || bootedRef.current) return
    bootedRef.current = true
    void begin()
  }, [enabled, begin])

  // Top the buffer up before it runs dry. A background failure while questions
  // are still in hand must not kill the session, so the error is kept for the
  // next attempt; only an empty buffer is a dead end worth blocking on.
  useEffect(() => {
    if (phase !== 'playing' || queue.length > PREFETCH_AT) return

    void fetchMore().catch((prefetchError) => {
      setError(errorMessage(prefetchError))
      if (queueRef.current.length === 0) setPhase('error')
    })
  }, [phase, queue.length, fetchMore])

  const selectOption = useCallback((optionId: string) => {
    if (phaseRef.current !== 'playing') return

    const question = queueRef.current[0]
    if (!question) return

    setSelected(optionId)
    setPhase('grading')

    gradeEndlessAnswer(question.id, optionId, sessionIdRef.current)
      .then((grade) => {
        setFeedback(grade)
        setStats((previous) => {
          const streak = grade.is_correct ? previous.streak + 1 : 0
          return {
            answered: previous.answered + 1,
            correct: previous.correct + (grade.is_correct ? 1 : 0),
            streak,
            bestStreak: Math.max(previous.bestStreak, streak),
          }
        })

        if (grade.progress) {
          setProgress((previous) => mergeProgress(previous, grade.progress!))
        }
      })
      .catch((gradeError) => {
        setError(errorMessage(gradeError))
        setPhase('error')
      })
  }, [])

  /** Move on to the buffered question. Safe to call before the timer fires. */
  const advance = useCallback(() => {
    setSelected(null)
    setFeedback(null)
    setQueue((previous) => previous.slice(1))
    setShown((value) => value + 1)
    setPhase('playing')
  }, [])

  // Auto-advance once the answer is graded. A correct answer clears quickly; a
  // miss waits so the explanation can be read. Clicking "Tiếp" skips the wait.
  useEffect(() => {
    if (phase !== 'grading' || !feedback) return

    const delay = feedback.is_correct ? ADVANCE_CORRECT_MS : ADVANCE_WRONG_MS
    const timer = window.setTimeout(advance, delay)
    return () => window.clearTimeout(timer)
  }, [phase, feedback, advance])

  // Session clock.
  useEffect(() => {
    if (phase !== 'playing' && phase !== 'grading') return

    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  const stop = useCallback(() => setPhase('stopped'), [])

  const restart = useCallback(async () => {
    seenRef.current = new Set()
    exhaustedRef.current = false
    fetchingRef.current = false
    setExhausted(false)
    setQueue([])
    setSelected(null)
    setFeedback(null)
    setStats(EMPTY_STATS)
    setSeconds(0)
    setShown(0)
    await begin()
  }, [begin])

  return {
    phase,
    current: queue[0] ?? null,
    queued: Math.max(0, queue.length - 1),
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
  }
}
