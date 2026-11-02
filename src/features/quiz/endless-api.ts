import { api, apiOrNull, query } from '@/lib/api'
import {
  toEndlessLeaderboardEntry,
  type EndlessBatch,
  type EndlessGrade,
  type EndlessLeaderboardEntry,
  type EndlessStats,
  type TopicLeaderboardEntry,
} from '@/lib/domain'

/**
 * Endless mode's server calls.
 *
 * The client never holds the answer key: `fetchEndlessBatch()` returns questions
 * with options but no `is_correct`, and `gradeEndlessAnswer()` reveals the key
 * for exactly one question, after it has been answered.
 */

/** How many questions a single round trip asks for. */
export const ENDLESS_BATCH_SIZE = 10

/**
 * Opens a run. The returned id is sent with every graded answer so the server
 * can score the session's best streak for the leaderboard.
 */
export async function startEndlessSession(topicId: string | null = null): Promise<string | null> {
  const { id } = await api<{ id: string }>('endless/sessions', {
    method: 'POST',
    body: { topic_id: topicId },
  })
  return id ?? null
}

export async function fetchEndlessBatch(
  limit: number = ENDLESS_BATCH_SIZE,
  exclude: string[] = [],
  topicId: string | null = null,
): Promise<EndlessBatch> {
  const batch = await api<EndlessBatch | null>('endless/batch', {
    method: 'POST',
    // A null topic keeps every subject in play.
    body: { limit, exclude, topic_id: topicId },
  })

  return {
    questions: batch?.questions ?? [],
    progress: batch?.progress ?? [],
  }
}

/** An answer in the shape its question's kind needs. */
export type EndlessAnswer =
  | { option_id: string }
  | { marks: Record<string, boolean> }
  | { text: string }

export async function gradeEndlessAnswer(
  questionId: string,
  answer: EndlessAnswer,
  sessionId: string | null = null,
): Promise<EndlessGrade> {
  return api<EndlessGrade>('endless/grade', {
    method: 'POST',
    body: { question_id: questionId, ...answer, session_id: sessionId },
  })
}

/** The separate Endless leaderboard — ranked by best session streak. */
export async function fetchEndlessLeaderboard(
  limit = 50,
): Promise<EndlessLeaderboardEntry[]> {
  const rows = await api<EndlessLeaderboardEntry[]>(`leaderboard/endless?limit=${limit}`)
  return rows.map(toEndlessLeaderboardEntry)
}

/** A topic board: players by correct Endless answers in one topic, or across every topic when it is null. */
export async function fetchTopicLeaderboard(topicSlug: string | null, limit = 50): Promise<TopicLeaderboardEntry[]> {
  return api<TopicLeaderboardEntry[]>(`leaderboard/topics${query({ topic: topicSlug, limit })}`)
}

/** The signed-in player's own Endless record (/progress). */
export async function fetchMyEndlessStats(): Promise<EndlessStats> {
  return api<EndlessStats>('me/endless')
}

/** Anyone's Endless record, for their public profile; null when the username doesn't exist. */
export async function fetchEndlessStatsOf(username: string): Promise<EndlessStats | null> {
  return apiOrNull<EndlessStats>(`profiles/${encodeURIComponent(username)}/endless`)
}
