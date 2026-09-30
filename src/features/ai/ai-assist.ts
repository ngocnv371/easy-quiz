import type { QuizDifficulty } from '@/lib/domain'
import { requireSupabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'

export interface AiGenerateInput {
  topic: string
  level?: string | null
  difficulty?: QuizDifficulty
  count?: number
  notes?: string | null
}

/** The shape the edge function guarantees after validation. */
export interface AiQuestion {
  prompt: string
  options: string[]
  correct_index: number
  explanation: string
}

export interface AiGenerateResult {
  questions: AiQuestion[]
  /** e.g. `gemini:gemini-2.5-flash`, `deepseek:deepseek-chat`, `mock`, `mock:fallback`. */
  provider: string
}

/**
 * Calls the `ai-quiz` edge function.
 *
 * The provider key never reaches the browser: this only sends the brief and
 * receives validated questions.
 */
export async function generateQuestions(input: AiGenerateInput): Promise<AiGenerateResult> {
  const supabase = requireSupabase()

  const { data, error } = await supabase.functions.invoke('ai-quiz', {
    body: {
      topic: input.topic,
      level: input.level ?? null,
      difficulty: input.difficulty ?? 'medium',
      count: input.count ?? 10,
      notes: input.notes ?? null,
    },
  })

  if (error) {
    // The function returns a helpful Vietnamese message under `error`; dig it
    // out of the response body rather than surfacing a generic HTTP failure.
    let message = errorMessage(error)
    const context = (error as { context?: unknown }).context

    if (context instanceof Response) {
      try {
        const body = (await context.clone().json()) as { error?: unknown }
        if (typeof body.error === 'string' && body.error !== '') message = body.error
      } catch {
        // Body was not JSON — keep the original message.
      }
    }

    throw new Error(message)
  }

  const payload = data as Partial<AiGenerateResult> | null

  if (!payload || !Array.isArray(payload.questions) || payload.questions.length === 0) {
    throw new Error('AI không trả về câu hỏi nào. Hãy thử mô tả chủ đề cụ thể hơn.')
  }

  return {
    questions: payload.questions,
    provider: typeof payload.provider === 'string' ? payload.provider : 'unknown',
  }
}

/** Human-readable label for the provider badge in the UI. */
export function describeProvider(provider: string): string {
  const model = provider.split(':')[1] ?? ''

  if (provider.startsWith('openai-compatible')) return `Tương thích OpenAI · ${model}`
  if (provider.startsWith('deepseek')) return `DeepSeek · ${model}`
  if (provider.startsWith('gemini')) return `Gemini · ${model}`
  if (provider.startsWith('openai')) return `OpenAI · ${model}`
  if (provider === 'mock:fallback') return 'Mẫu (AI không phản hồi)'
  return 'Mẫu ngoại tuyến'
}
