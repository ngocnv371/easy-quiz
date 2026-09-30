/**
 * A student's own learning progress, derived entirely on the client.
 *
 * `fetchMyAttempts()` already returns one row per completed run with the quiz
 * title, topic and accuracy attached, so there is no new query or RPC to
 * maintain — this module just pivots those runs by quiz and ranks the ones
 * worth another go.
 *
 * The maths lives here rather than in the page so the shapes are typed once and
 * the component only renders. `nowMs` is injected (rather than read inside the
 * aggregation) so the result is deterministic for a given timestamp.
 */

import { formatPercent } from '@/lib/format'
import type { LeaderboardEntry } from '@/lib/domain'

/** Accuracy (0–100) at or above which a quiz counts as mastered. */
export const MASTERED_ACCURACY = 80

/** Below this, a quiz is flagged as needing practice. */
export const NEEDS_PRACTICE_ACCURACY = 50

/** A quiz left untouched for this many days is worth revisiting. */
const STALE_DAYS = 7

/** How many retry suggestions the page surfaces. */
const MAX_SUGGESTIONS = 4

export type MasteryLevel = 'mastered' | 'developing' | 'needs-practice'

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  mastered: 'Đã thành thạo',
  developing: 'Đang tiến bộ',
  'needs-practice': 'Cần luyện thêm',
}

export interface QuizProgress {
  quizId: string
  slug: string
  title: string
  coverEmoji: string
  topicName: string | null
  topicSlug: string | null
  attemptCount: number
  maxScore: number
  bestScore: number
  /** Best accuracy across every run on this quiz, 0–100. */
  bestAccuracy: number
  latestScore: number
  latestAccuracy: number
  latestAt: string
  /** Average accuracy across runs, 0–100. */
  averageAccuracy: number
  /** Latest accuracy − previous accuracy (0 with a single run), in points. */
  trend: number
  mastery: MasteryLevel
}

export interface RetrySuggestion {
  quiz: QuizProgress
  /** Higher means more urgent. */
  priority: number
  /** A short Vietnamese explanation of why this quiz is worth another go. */
  reason: string
}

export interface TopicProgress {
  slug: string
  name: string
  attemptCount: number
  quizCount: number
  /** Average accuracy across every run in the topic, 0–100. */
  averageAccuracy: number
}

export interface ProgressReport {
  totalAttempts: number
  quizzesPlayed: number
  totalScore: number
  /** Average accuracy across every run, 0–100. */
  averageAccuracy: number
  bestAccuracy: number
  lastPlayedAt: string | null
  masteredCount: number
  needsPracticeCount: number
  /** Every quiz attempted, weakest first. */
  quizzes: QuizProgress[]
  /** The handful most worth retrying, strongest suggestion first. */
  suggestions: RetrySuggestion[]
  /** Topics the student has played, strongest first. */
  topics: TopicProgress[]
}

function masteryFor(bestAccuracy: number): MasteryLevel {
  if (bestAccuracy >= MASTERED_ACCURACY) return 'mastered'
  if (bestAccuracy < NEEDS_PRACTICE_ACCURACY) return 'needs-practice'
  return 'developing'
}

function daysSince(iso: string, nowMs: number): number | null {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return null
  return Math.floor((nowMs - then) / 86_400_000)
}

/** Newest first. An unparseable date sorts to the bottom rather than throwing. */
function byCompletedAtDesc(a: LeaderboardEntry, b: LeaderboardEntry): number {
  const left = Date.parse(a.completed_at)
  const right = Date.parse(b.completed_at)
  if (Number.isNaN(left) && Number.isNaN(right)) return 0
  if (Number.isNaN(left)) return 1
  if (Number.isNaN(right)) return -1
  return right - left
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

export function buildProgressReport(
  attempts: LeaderboardEntry[],
  nowMs: number = Date.now(),
): ProgressReport {
  const byQuiz = new Map<string, LeaderboardEntry[]>()

  for (const attempt of attempts) {
    const group = byQuiz.get(attempt.quiz_id)
    if (group) group.push(attempt)
    else byQuiz.set(attempt.quiz_id, [attempt])
  }

  const quizzes: QuizProgress[] = []

  for (const [quizId, runs] of byQuiz) {
    const ordered = [...runs].sort(byCompletedAtDesc)
    const latest = ordered[0]!
    const previous = ordered[1] ?? null

    const bestAccuracy = runs.reduce((max, run) => Math.max(max, run.accuracy), 0)
    const averageAccuracy =
      runs.reduce((sum, run) => sum + run.accuracy, 0) / runs.length

    quizzes.push({
      quizId,
      slug: latest.quiz_slug,
      title: latest.quiz_title,
      coverEmoji: latest.cover_emoji,
      topicName: latest.topic_name,
      topicSlug: latest.topic_slug,
      attemptCount: runs.length,
      maxScore: runs.reduce((max, run) => Math.max(max, run.max_score), 0),
      bestScore: runs.reduce((max, run) => Math.max(max, run.score), 0),
      bestAccuracy: round(bestAccuracy),
      latestScore: latest.score,
      latestAccuracy: round(latest.accuracy),
      latestAt: latest.completed_at,
      averageAccuracy: round(averageAccuracy),
      trend: previous ? round(latest.accuracy - previous.accuracy) : 0,
      mastery: masteryFor(bestAccuracy),
    })
  }

  // Weakest first: the biggest accuracy gap leads, then the least practised.
  quizzes.sort(
    (a, b) => a.bestAccuracy - b.bestAccuracy || a.attemptCount - b.attemptCount,
  )

  const suggestions = quizzes
    .filter((quiz) => quiz.bestAccuracy < MASTERED_ACCURACY)
    .map((quiz) => ({ quiz, ...scoreRetry(quiz, nowMs) }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_SUGGESTIONS)

  const topics = buildTopicProgress(quizzes)

  const totalScore = attempts.reduce((sum, run) => sum + run.score, 0)
  const totalAccuracy = attempts.reduce((sum, run) => sum + run.accuracy, 0)

  return {
    totalAttempts: attempts.length,
    quizzesPlayed: quizzes.length,
    totalScore,
    averageAccuracy: attempts.length === 0 ? 0 : round(totalAccuracy / attempts.length),
    bestAccuracy: round(attempts.reduce((max, run) => Math.max(max, run.accuracy), 0)),
    lastPlayedAt:
      attempts.length === 0
        ? null
        : [...attempts].sort(byCompletedAtDesc)[0]!.completed_at,
    masteredCount: quizzes.filter((quiz) => quiz.mastery === 'mastered').length,
    needsPracticeCount: quizzes.filter((quiz) => quiz.mastery === 'needs-practice').length,
    quizzes,
    suggestions,
    topics,
  }
}

/**
 * How urgent a retry is, plus a plain-language reason. A quiz is a candidate
 * when it is not yet mastered, so the ranking is driven by the size of the
 * accuracy gap and nudged up for a declining score, a long break or a single
 * attempt that never had a second pass.
 */
function scoreRetry(quiz: QuizProgress, nowMs: number): { priority: number; reason: string } {
  const dayCount = daysSince(quiz.latestAt, nowMs)
  const isStale = dayCount !== null && dayCount >= STALE_DAYS

  const priority =
    (100 - quiz.bestAccuracy) +
    (isStale ? 8 : 0) +
    (quiz.attemptCount === 1 ? 6 : 0) +
    (quiz.trend < -5 ? 5 : 0)

  if (quiz.bestAccuracy < NEEDS_PRACTICE_ACCURACY) {
    return {
      priority,
      reason: `Độ chính xác cao nhất mới ${formatPercent(quiz.bestAccuracy)} — hãy ôn lại phần này.`,
    }
  }

  if (quiz.trend < -5) {
    return {
      priority,
      reason: `Điểm giảm ${formatPercent(Math.abs(quiz.trend))} so với lần trước.`,
    }
  }

  if (isStale) {
    return { priority, reason: `Đã ${dayCount} ngày bạn chưa luyện lại đề này.` }
  }

  if (quiz.attemptCount === 1) {
    return { priority, reason: 'Bạn mới thử một lần — làm lại để nhớ lâu hơn.' }
  }

  return {
    priority,
    reason: `Chưa đạt mức thành thạo (cao nhất ${formatPercent(quiz.bestAccuracy)}).`,
  }
}

function buildTopicProgress(quizzes: QuizProgress[]): TopicProgress[] {
  const byTopic = new Map<string, TopicProgress>()

  for (const quiz of quizzes) {
    // A quiz with no topic is not comparable to any other, so it is left out
    // rather than lumped into a misleading "no topic" bucket.
    if (!quiz.topicSlug || !quiz.topicName) continue

    const entry = byTopic.get(quiz.topicSlug) ?? {
      slug: quiz.topicSlug,
      name: quiz.topicName,
      attemptCount: 0,
      quizCount: 0,
      averageAccuracy: 0,
    }

    // Running mean, weighted by the number of runs on each quiz.
    const runsSoFar = entry.attemptCount
    const total = runsSoFar + quiz.attemptCount
    entry.averageAccuracy =
      total === 0
        ? 0
        : round((entry.averageAccuracy * runsSoFar + quiz.averageAccuracy * quiz.attemptCount) / total)
    entry.attemptCount = total
    entry.quizCount += 1

    byTopic.set(quiz.topicSlug, entry)
  }

  return [...byTopic.values()].sort((a, b) => b.averageAccuracy - a.averageAccuracy)
}
