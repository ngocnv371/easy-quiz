import { toEnergyError } from '@/features/energy/api'
import { requireSupabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'
import {
  toEndlessLeaderboardEntry,
  type EndlessBatch,
  type EndlessGrade,
  type EndlessLeaderboardEntry,
} from '@/lib/domain'

/**
 * Endless mode's two server calls.
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
  const supabase = requireSupabase()

  const { data, error } = await supabase.rpc('start_endless_session', {
    p_topic_id: topicId ?? undefined,
  })

  if (error) throw new Error(errorMessage(error))
  return typeof data === 'string' ? data : null
}

export async function fetchEndlessBatch(
  limit: number = ENDLESS_BATCH_SIZE,
  exclude: string[] = [],
  topicId: string | null = null,
): Promise<EndlessBatch> {
  const supabase = requireSupabase()

  const { data, error } = await supabase.rpc('get_endless_batch', {
    p_limit: limit,
    p_exclude: exclude,
    // `undefined` omits the argument, so the SQL default (all subjects) applies.
    p_topic_id: topicId ?? undefined,
  })

  if (error) throw new Error(errorMessage(error))

  const batch = (data ?? null) as unknown as EndlessBatch | null
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
  const supabase = requireSupabase()

  const { data, error } = await supabase.rpc('grade_endless_answer', {
    p_question_id: questionId,
    p_option_id: optionId,
    p_session_id: sessionId ?? undefined,
  })

  // Out of energy surfaces as `OutOfEnergyError`, so the player can refill
  // instead of hitting the generic error screen.
  if (error) throw toEnergyError(error)
  if (!data) throw new Error('Không nhận được kết quả từ máy chủ.')

  return data as unknown as EndlessGrade
}

/** The separate Endless leaderboard — ranked by best session streak. */
export async function fetchEndlessLeaderboard(
  limit = 50,
): Promise<EndlessLeaderboardEntry[]> {
  const supabase = requireSupabase()

  const { data, error } = await supabase.rpc('get_endless_leaderboard', { p_limit: limit })

  if (error) throw new Error(errorMessage(error))
  return (data ?? []).map(toEndlessLeaderboardEntry)
}
