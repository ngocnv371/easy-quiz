import type { QuizDifficulty } from '@/lib/domain'
import { ApiError, api } from '@/lib/api'

export interface AiGenerateInput {
  topic: string
  level?: string | null
  difficulty?: QuizDifficulty
  count?: number
  notes?: string | null
}

/** The shape the Worker guarantees after validation. */
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
  /** Credit balance left after this generation, when the server reports it. */
  credits: number | null
}

/** Thrown when the admin's AI credit balance cannot cover the request. */
export class AiCreditsExhaustedError extends Error {}

/**
 * Calls AI Assist on the Worker (`worker/ai.ts`).
 *
 * The provider key never reaches the browser: this only sends the brief and
 * receives validated questions.
 */
export async function generateQuestions(input: AiGenerateInput): Promise<AiGenerateResult> {
  let payload: Partial<AiGenerateResult> | null
  try {
    payload = await api<Partial<AiGenerateResult> | null>('manage/ai', {
      method: 'POST',
      body: {
        topic: input.topic,
        level: input.level ?? null,
        difficulty: input.difficulty ?? 'medium',
        count: input.count ?? 10,
        notes: input.notes ?? null,
      },
    })
  } catch (error) {
    if (error instanceof ApiError && error.code === 'insufficient_credits') {
      throw new AiCreditsExhaustedError(error.message)
    }
    throw error
  }

  if (!payload || !Array.isArray(payload.questions) || payload.questions.length === 0) {
    throw new Error('AI không trả về câu hỏi nào. Hãy thử mô tả chủ đề cụ thể hơn.')
  }

  return {
    questions: payload.questions,
    provider: typeof payload.provider === 'string' ? payload.provider : 'unknown',
    credits: typeof payload.credits === 'number' ? payload.credits : null,
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
