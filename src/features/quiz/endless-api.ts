import { toEnergyError } from '@/features/energy/api'
import { api } from '@/lib/api'
import {
  toEndlessLeaderboardEntry,
  type EndlessBatch,
  type EndlessGrade,
  type EndlessLeaderboardEntry,
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

export async function gradeEndlessAnswer(
  questionId: string,
  optionId: string,
  sessionId: string | null = null,
): Promise<EndlessGrade> {
  try {
    return await api<EndlessGrade>('endless/grade', {
      method: 'POST',
      body: { question_id: questionId, option_id: optionId, session_id: sessionId },
    })
  } catch (error) {
    // Out of energy surfaces as `OutOfEnergyError`, so the player can refill
    // instead of hitting the generic error screen.
    throw toEnergyError(error)
  }
}

/** The separate Endless leaderboard — ranked by best session streak. */
export async function fetchEndlessLeaderboard(
  limit = 50,
): Promise<EndlessLeaderboardEntry[]> {
  const rows = await api<EndlessLeaderboardEntry[]>(`leaderboard/endless?limit=${limit}`)
  return rows.map(toEndlessLeaderboardEntry)
}
