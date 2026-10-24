import { toEnergyError, type EnergyState } from '@/features/energy/api'
import { api, apiOrNull, query } from '@/lib/api'
import {
  toGlobalLeaderboardEntry,
  toLeaderboardEntry,
  toQuizCard,
  type AnswerSubmission,
  type GlobalLeaderboardEntry,
  type GlobalLeaderboardRow,
  type LeaderboardEntry,
  type LeaderboardEntryRow,
  type PlayPayload,
  type QuizCard,
  type QuizCardRow,
  type SubmitResult,
  type TopicRow,
} from '@/lib/domain'

export type QuizSort = 'new' | 'popular' | 'alphabetical'

export interface QuizQuery {
  topicSlug?: string | null
  /** Any of these topics — a whole grade or subject. Ignored when `topicSlug` is set. */
  topicSlugs?: string[] | null
  search?: string
  difficulty?: string | null
  sort?: QuizSort
  limit?: number
}

export async function fetchTopics(): Promise<TopicRow[]> {
  return api<TopicRow[]>('topics')
}

export async function fetchQuizCards(params: QuizQuery = {}): Promise<QuizCard[]> {
  const { topicSlug, topicSlugs, search, difficulty, sort = 'new', limit = 60 } = params

  const rows = await api<QuizCardRow[]>(
    `quizzes${query({
      topic: topicSlug,
      topics: topicSlug ? null : topicSlugs?.join(','),
      search: search?.trim(),
      difficulty,
      sort,
      limit,
    })}`,
  )

  return rows.map(toQuizCard)
}

export async function fetchQuizCardBySlug(slug: string): Promise<QuizCard | null> {
  const row = await apiOrNull<QuizCardRow>(`quizzes/${encodeURIComponent(slug)}`)
  return row ? toQuizCard(row) : null
}

/**
 * The playable payload. Returns `null` — rather than throwing — when the quiz
 * is not published or the slug does not exist, because "not playable" is a
 * normal outcome the caller renders as a friendly page.
 */
export async function fetchPlayPayload(slug: string): Promise<PlayPayload | null> {
  return apiOrNull<PlayPayload>(`quizzes/${encodeURIComponent(slug)}/play`)
}

export interface QuizTicket {
  ticket_id: string
  /** Energy charged for this start — one per question. */
  cost: number
  energy: EnergyState
}

/**
 * Pays for a run up front and returns the ticket `submitAttempt()` redeems.
 * Throws `OutOfEnergyError` when the quiz costs more than the player has.
 */
export async function startQuizAttempt(slug: string): Promise<QuizTicket> {
  try {
    return await api<QuizTicket>(`quizzes/${encodeURIComponent(slug)}/start`, { method: 'POST' })
  } catch (error) {
    throw toEnergyError(error)
  }
}

export interface SubmitAttemptInput {
  slug: string
  answers: AnswerSubmission[]
  durationSeconds: number
  guestName?: string | null
  /** From `startQuizAttempt()`. The server refuses a submit without one. */
  ticketId: string | null
}

export async function submitAttempt({
  slug,
  answers,
  durationSeconds,
  guestName,
  ticketId,
}: SubmitAttemptInput): Promise<SubmitResult> {
  return api<SubmitResult>(`quizzes/${encodeURIComponent(slug)}/submit`, {
    method: 'POST',
    body: {
      answers: answers.map((answer) => ({
        question_id: answer.question_id,
        option_id: answer.option_id,
        marks: answer.marks,
        text: answer.text,
        time_ms: Math.round(answer.time_ms),
      })),
      duration_seconds: Math.round(durationSeconds),
      guest_name: guestName ?? null,
      ticket_id: ticketId,
    },
  })
}

export async function fetchQuizLeaderboard(
  quizId: string,
  limit = 20,
): Promise<LeaderboardEntry[]> {
  const rows = await api<LeaderboardEntryRow[]>(`leaderboard/quiz/${quizId}${query({ limit })}`)
  return rows.map(toLeaderboardEntry)
}

export async function fetchGlobalLeaderboard(limit = 50): Promise<GlobalLeaderboardEntry[]> {
  const rows = await api<GlobalLeaderboardRow[]>(`leaderboard/global${query({ limit })}`)

  return rows
    .map(toGlobalLeaderboardEntry)
    .filter((entry): entry is GlobalLeaderboardEntry => entry !== null)
}

export async function fetchMyAttempts(
  userId: string,
  limit = 30,
): Promise<LeaderboardEntry[]> {
  const rows = await api<LeaderboardEntryRow[]>(`attempts${query({ user: userId, limit })}`)
  return rows.map(toLeaderboardEntry)
}

/** Used by the result page when it is opened without an in-memory payload. */
export async function fetchAttempt(
  attemptId: string,
): Promise<LeaderboardEntry | null> {
  const row = await apiOrNull<LeaderboardEntryRow>(`attempts/${attemptId}`)
  return row ? toLeaderboardEntry(row) : null
}

/**
 * Best score a player already holds on a quiz, so the result screen can say
 * "phá kỷ lục" instead of just showing a number.
 */
export async function fetchPersonalBest(
  quizId: string,
  userId: string,
  excludeAttemptId?: string,
): Promise<number> {
  try {
    const { best } = await api<{ best: number }>(
      `attempts/best${query({ quiz: quizId, user: userId, exclude: excludeAttemptId })}`,
    )
    return best
  } catch {
    return 0
  }
}
