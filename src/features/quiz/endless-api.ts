import { requireSupabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'
import type { EndlessBatch, EndlessGrade } from '@/lib/domain'

/**
 * Endless mode's two server calls.
 *
 * The client never holds the answer key: `fetchEndlessBatch()` returns questions
 * with options but no `is_correct`, and `gradeEndlessAnswer()` reveals the key
 * for exactly one question, after it has been answered.
 */

/** How many questions a single round trip asks for. */
export const ENDLESS_BATCH_SIZE = 10

export async function fetchEndlessBatch(
  limit: number = ENDLESS_BATCH_SIZE,
  exclude: string[] = [],
): Promise<EndlessBatch> {
  const supabase = requireSupabase()

  const { data, error } = await supabase.rpc('get_endless_batch', {
    p_limit: limit,
    p_exclude: exclude,
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
): Promise<EndlessGrade> {
  const supabase = requireSupabase()

  const { data, error } = await supabase.rpc('grade_endless_answer', {
    p_question_id: questionId,
    p_option_id: optionId,
  })

  if (error) throw new Error(errorMessage(error))
  if (!data) throw new Error('Không nhận được kết quả từ máy chủ.')

  return data as unknown as EndlessGrade
}
