/**
 * Performance statistics for one quiz, derived entirely on the client.
 *
 * Teachers can already read their own `attempts`, `attempt_answers` and
 * `questions` through RLS, so the report is a plain read plus a pure
 * aggregation step — no RPC to maintain. Keeping the maths here (rather than in
 * the page) means the shape is typed once and the component only renders.
 *
 * Two honest caveats the UI repeats to the teacher:
 *   · `duration_seconds` is 0 when a run was never timed (older attempts, or a
 *     client that did not report a duration) — those rows still count as a
 *     participant but are excluded from the time statistics.
 *   · `attempt_answers` carries one row per question, so a question added after
 *     the earliest attempts has a smaller sample than the quiz as a whole.
 */

import type { AttemptAnswerRow, AttemptRow, QuestionRow } from '@/lib/domain'

/** A run counts as passing at 50% of the maximum score. */
export const PASS_THRESHOLD_PERCENT = 50

export interface ChartDatum {
  label: string
  value: number
}

export interface ScoreBucket extends ChartDatum {
  from: number
  to: number
}

export interface QuestionStat {
  questionId: string
  position: number
  prompt: string
  /** Answers recorded for this question across every attempt in scope. */
  answered: number
  correct: number
  wrong: number
  /** Share of answers that were right, 0–100. */
  correctRate: number
  /** Average time spent on the question, in seconds. */
  averageSeconds: number
}

export interface QuizReport {
  attemptCount: number
  participantCount: number
  questionCount: number
  maxScore: number
  averageScore: number
  averageAccuracy: number
  passRate: number
  highScore: number
  lowScore: number
  completion: {
    /** Runs that reported a non-zero duration. */
    timedCount: number
    averageSeconds: number
    medianSeconds: number
    fastestSeconds: number
    slowestSeconds: number
    histogram: ChartDatum[]
  }
  scoreDistribution: ScoreBucket[]
  /** Worst questions first — the "what should I reteach?" list. */
  questions: QuestionStat[]
}

// Five bands of the score as a share of the maximum.
const SCORE_BUCKETS: ReadonlyArray<Omit<ScoreBucket, 'value'>> = [
  { label: '0–20%', from: 0, to: 20 },
  { label: '20–40%', from: 20, to: 40 },
  { label: '40–60%', from: 40, to: 60 },
  { label: '60–80%', from: 60, to: 80 },
  { label: '80–100%', from: 80, to: 100 },
]

function percentOf(score: number, max: number): number {
  if (max <= 0) return 0
  return (score / max) * 100
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

/**
 * Five equal-width buckets across the observed range. Untimed runs (`0`) are
 * dropped before calling this, so the first bucket is never a spike of noise.
 */
function durationHistogram(durations: number[]): ChartDatum[] {
  if (durations.length === 0) return []

  const max = Math.max(...durations)
  const bucketCount = 5
  const width = Math.max(1, max / bucketCount)
  const buckets: ChartDatum[] = Array.from({ length: bucketCount }, (_, index) => {
    const from = Math.floor(index * width)
    const to = Math.floor((index + 1) * width)
    return { label: `${from}–${to}s`, value: 0 }
  })

  for (const duration of durations) {
    const index = Math.min(bucketCount - 1, Math.floor(duration / width))
    buckets[index]!.value += 1
  }

  return buckets
}

function buildQuestionStats(
  questions: QuestionRow[],
  answers: AttemptAnswerRow[],
): QuestionStat[] {
  const byQuestion = new Map<string, { answered: number; correct: number; totalMs: number }>()

  for (const answer of answers) {
    const entry = byQuestion.get(answer.question_id) ?? {
      answered: 0,
      correct: 0,
      totalMs: 0,
    }
    entry.answered += 1
    if (answer.is_correct) entry.correct += 1
    entry.totalMs += Math.max(0, answer.time_ms)
    byQuestion.set(answer.question_id, entry)
  }

  return questions
    .map((question) => {
      const entry = byQuestion.get(question.id) ?? { answered: 0, correct: 0, totalMs: 0 }
      return {
        questionId: question.id,
        position: question.position,
        prompt: question.prompt,
        answered: entry.answered,
        correct: entry.correct,
        wrong: entry.answered - entry.correct,
        correctRate: entry.answered > 0 ? (entry.correct / entry.answered) * 100 : 0,
        averageSeconds: entry.answered > 0 ? entry.totalMs / entry.answered / 1000 : 0,
      }
    })
    // Most-wrong first; ties broken by the larger sample so the ranking is
    // stable, and unattempted questions settle at the bottom.
    .sort((a, b) => b.wrong - a.wrong || b.answered - a.answered || a.position - b.position)
}

export function buildQuizReport(input: {
  attempts: AttemptRow[]
  questions: QuestionRow[]
  answers: AttemptAnswerRow[]
}): QuizReport {
  const { attempts, questions, answers } = input

  const scores = attempts.map((attempt) => attempt.score)
  const accuracies = attempts.map((attempt) => attempt.accuracy)

  const questionPoints = questions.reduce((sum, question) => sum + question.points, 0)
  const recordedMax = attempts.reduce((max, attempt) => Math.max(max, attempt.max_score), 0)
  const maxScore = questionPoints > 0 ? questionPoints : recordedMax

  // A guest is still a distinct user, but a legacy row can have no user_id at
  // all — count each of those as its own participant.
  const userIds = new Set<string>()
  let anonymousAttempts = 0
  for (const attempt of attempts) {
    if (attempt.user_id) userIds.add(attempt.user_id)
    else anonymousAttempts += 1
  }

  const scoreDistribution: ScoreBucket[] = SCORE_BUCKETS.map((bucket) => ({
    ...bucket,
    value: attempts.filter((attempt) => {
      const percent = percentOf(attempt.score, maxScore)
      return percent >= bucket.from && (percent < bucket.to || bucket.to === 100)
    }).length,
  }))

  const durations = attempts
    .map((attempt) => attempt.duration_seconds)
    .filter((duration) => duration > 0)

  const passing = attempts.filter(
    (attempt) => percentOf(attempt.score, maxScore) >= PASS_THRESHOLD_PERCENT,
  ).length

  return {
    attemptCount: attempts.length,
    participantCount: userIds.size + anonymousAttempts,
    questionCount: questions.length,
    maxScore,
    averageScore: average(scores),
    averageAccuracy: average(accuracies),
    passRate: attempts.length > 0 ? (passing / attempts.length) * 100 : 0,
    highScore: scores.length > 0 ? Math.max(...scores) : 0,
    lowScore: scores.length > 0 ? Math.min(...scores) : 0,
    completion: {
      timedCount: durations.length,
      averageSeconds: average(durations),
      medianSeconds: median(durations),
      fastestSeconds: durations.length > 0 ? Math.min(...durations) : 0,
      slowestSeconds: durations.length > 0 ? Math.max(...durations) : 0,
      histogram: durationHistogram(durations),
    },
    scoreDistribution,
    questions: buildQuestionStats(questions, answers),
  }
}
