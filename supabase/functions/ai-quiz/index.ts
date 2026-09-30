// ═══════════════════════════════════════════════════════════════════════════
// ai-quiz — AI Assist for the teacher console
//
// Takes a short brief ("Ôn tập lịch sử Việt Nam lớp 9, mức trung bình") and
// returns a set of multiple-choice questions the editor can drop straight into
// a draft.
//
// The provider key lives here, never in the browser. `AI_PROVIDER` picks the
// adapter — `gemini`, `openai`, `deepseek`, or any other OpenAI-compatible
// endpoint — so swapping providers, or falling back to the offline generator,
// is a secret change, not a redeploy of the front end.
//
//   POST /functions/v1/ai-quiz
//   { topic, level?, difficulty?, count?, notes? }
//   → { questions: [{ prompt, options, correct_index, explanation }], provider }
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2'

interface GenerateRequest {
  topic: string
  level?: string | null
  difficulty?: 'easy' | 'medium' | 'hard'
  count?: number
  notes?: string | null
}

interface GeneratedQuestion {
  prompt: string
  options: string[]
  correct_index: number
  explanation: string
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-ai-assist-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_COUNT = 20
const MIN_COUNT = 3

/**
 * Misconfiguration (a missing key, an unusable endpoint) rather than a provider
 * outage. This one is surfaced to the caller instead of falling back to mock
 * questions, because placeholder content would hide the mistake.
 */
class ConfigError extends Error {}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function clampCount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return 10
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.trunc(parsed)))
}

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'dễ (nhớ và nhận biết)',
  medium: 'trung bình (hiểu và vận dụng)',
  hard: 'khó (phân tích và suy luận)',
}

function buildPrompt(input: GenerateRequest, count: number): string {
  const difficulty = DIFFICULTY_LABELS[input.difficulty ?? 'medium'] ?? DIFFICULTY_LABELS.medium
  const level = input.level?.trim() || 'học sinh phổ thông'
  const notes = input.notes?.trim()

  return [
    `Bạn là giáo viên soạn đề trắc nghiệm cho ${level}.`,
    `Hãy soạn đúng ${count} câu hỏi trắc nghiệm bằng tiếng Việt về chủ đề: "${input.topic.trim()}".`,
    `Mức độ: ${difficulty}.`,
    notes ? `Yêu cầu thêm: ${notes}` : '',
    '',
    'Quy tắc bắt buộc:',
    '- Mỗi câu có đúng 4 lựa chọn, chỉ một lựa chọn đúng.',
    '- Các lựa chọn sai phải hợp lý, không được ngớ ngẩn hay trùng lặp.',
    '- Câu hỏi phải rõ ràng, tự chứa đủ ngữ cảnh, không viết kiểu "theo đoạn văn trên".',
    '- Lời giải ngắn gọn, giải thích vì sao đáp án đúng.',
    '- Không đánh số thứ tự trong trường prompt.',
    '',
    'Trả về JSON đúng định dạng:',
    '{"questions":[{"prompt":"...","options":["...","...","...","..."],"correct_index":0,"explanation":"..."}]}',
  ]
    .filter((line) => line !== '')
    .join('\n')
}

// ── Response validation ────────────────────────────────────────────────────
// The model is asked for a shape; this makes sure we got it before handing
// anything to the editor. A malformed question is dropped rather than guessed.

function coerceQuestions(raw: unknown, expected: number): GeneratedQuestion[] {
  if (!raw || typeof raw !== 'object') return []

  const list = (raw as { questions?: unknown }).questions
  if (!Array.isArray(list)) return []

  const questions: GeneratedQuestion[] = []

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue

    const record = entry as Record<string, unknown>
    const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : ''
    const explanation = typeof record.explanation === 'string' ? record.explanation.trim() : ''

    const options = Array.isArray(record.options)
      ? record.options
          .filter((option): option is string => typeof option === 'string')
          .map((option) => option.trim())
          .filter((option) => option !== '')
      : []

    const correctIndex = Number.parseInt(String(record.correct_index ?? record.correctIndex ?? ''), 10)

    if (prompt === '' || options.length < 2) continue
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) continue

    questions.push({ prompt, options, correct_index: correctIndex, explanation })
  }

  return questions.slice(0, expected)
}

// ── Providers ─────────Config─────────────────────────────────────────────────────

async function generateWithGemini(
  prompt: string,
  count: number,
): Promise<{ questions: GeneratedQuestion[]; provider: string }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('Thiếu GEMINI_API_KEY cho nhà cung cấp Gemini.')

  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              questions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    prompt: { type: 'string' },
                    options: { type: 'array', items: { type: 'string' } },
                    correct_index: { type: 'integer' },
                    explanation: { type: 'string' },
                  },
                  required: ['prompt', 'options', 'correct_index'],
                },
              },
            },
            required: ['questions'],
          },
        },
      }),
    },
  )

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Gemini trả về lỗi ${response.status}: ${detail.slice(0, 300)}`)
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }

  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''

  return { questions: coerceQuestions(JSON.parse(text), count), provider: `gemini:${model}` }
}

/**
 * An OpenAI-compatible chat-completions provider.
 *
 * Anything that speaks the `/chat/completions` dialect fits: OpenAI, DeepSeek,
 * OpenRouter, Together, Groq, a local vLLM or Ollama server… Only the base URL,
 * key and model differ, so they all share one adapter.
 */
interface ChatProvider {
  /** Short name that ends up in the `provider` string the UI badges. */
  label: string
  /** Human name used in error messages. */
  displayName: string
  /** Env var the key is expected to live in, for error messages. */
  keyEnv: string
  apiKey: string | undefined
  model: string
  baseUrl: string
}

/**
 * Resolves an OpenAI-compatible provider from `AI_PROVIDER`.
 *
 * `deepseek` is a convenience preset reading its own `DEEPSEEK_*` variables.
 * `openai` reads `OPENAI_*`, and because `OPENAI_BASE_URL` is honoured, it also
 * doubles as the generic escape hatch for any other compatible endpoint.
 */
function resolveChatProvider(setting: string): ChatProvider | null {
  if (setting === 'deepseek') {
    const baseUrl = Deno.env.get('DEEPSEEK_BASE_URL')?.trim() || 'https://api.deepseek.com/v1'

    return {
      label: 'deepseek',
      displayName: 'DeepSeek',
      keyEnv: 'DEEPSEEK_API_KEY',
      // Accept the generic key too, so one secret can cover either preset.
      apiKey: Deno.env.get('DEEPSEEK_API_KEY')?.trim() || Deno.env.get('OPENAI_API_KEY')?.trim(),
      model: Deno.env.get('DEEPSEEK_MODEL')?.trim() || 'deepseek-chat',
      baseUrl,
    }
  }

  if (setting === 'openai' || setting === 'compatible' || setting === 'openai-compatible') {
    const baseUrl = Deno.env.get('OPENAI_BASE_URL')?.trim() || 'https://api.openai.com/v1'
    const isOfficial = baseUrl.replace(/\/+$/, '').toLowerCase() === 'https://api.openai.com/v1'

    return {
      label: isOfficial ? 'openai' : 'openai-compatible',
      displayName: isOfficial ? 'OpenAI' : `điểm cuối tương thích OpenAI (${baseUrl})`,
      keyEnv: 'OPENAI_API_KEY',
      apiKey: Deno.env.get('OPENAI_API_KEY')?.trim(),
      model: Deno.env.get('OPENAI_MODEL')?.trim() || 'gpt-4o-mini',
      baseUrl,
    }
  }

  return null
}

function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (/\/chat\/completions$/.test(trimmed)) return trimmed
  return `${trimmed}/chat/completions`
}

/**
 * JSON out of a model reply.
 *
 * Not every endpoint honours `response_format`, and some wrap the object in a
 * ```json fence anyway. Both are recoverable, so recover rather than fail.
 */
function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  try {
    return JSON.parse(unfenced)
  } catch {
    const start = unfenced.indexOf('{')
    const end = unfenced.lastIndexOf('}')

    if (start !== -1 && end > start) {
      return JSON.parse(unfenced.slice(start, end + 1))
    }

    throw new Error('Model không trả về JSON hợp lệ.')
  }
}

async function generateWithChatProvider(
  provider: ChatProvider,
  prompt: string,
  count: number,
): Promise<{ questions: GeneratedQuestion[]; provider: string }> {
  const apiKey = provider.apiKey

  if (!apiKey) {
    throw new ConfigError(
      `Thiếu API key cho ${provider.displayName}. Đặt ${provider.keyEnv} trong supabase/functions/.env.`,
    )
  }

  const url = chatCompletionsUrl(provider.baseUrl)

  const buildBody = (jsonMode: boolean) =>
    JSON.stringify({
      model: provider.model,
      temperature: 0.8,
      // Most compatible endpoints accept this; the ones that reject it are
      // retried without it below.
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        {
          role: 'system',
          content: 'Bạn là giáo viên soạn đề trắc nghiệm. Chỉ trả về JSON hợp lệ.',
        },
        { role: 'user', content: prompt },
      ],
    })

  const send = (jsonMode: boolean) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: buildBody(jsonMode),
    })

  let response = await send(true)

  if (response.status === 400) {
    const detail = await response.text()

    if (/response_format|json_object|json mode|unsupported/i.test(detail)) {
      response = await send(false)
    } else {
      throw new Error(`${provider.displayName} trả về lỗi 400: ${detail.slice(0, 300)}`)
    }
  }

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`${provider.displayName} trả về lỗi ${response.status}: ${detail.slice(0, 300)}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const text = payload.choices?.[0]?.message?.content ?? ''

  return {
    questions: coerceQuestions(extractJson(text), count),
    provider: `${provider.label}:${provider.model}`,
  }
}

/**
 * Offline generator.
 *
 * Keeps the whole AI Assist flow — brief, preview, edit, publish — working
 * before any provider key exists, and gives the UI something deterministic to
 * develop against. It is honest about what it is: the returned questions are
 * a scaffolding template, not real content.
 */
function generateMock(input: GenerateRequest, count: number): GeneratedQuestion[] {
  const topic = input.topic.trim() || 'chủ đề đã chọn'
  const stems = [
    `Khái niệm nào sau đây mô tả đúng nhất về ${topic}?`,
    `Điểm then chốt cần nhớ khi học ${topic} là gì?`,
    `Trong ${topic}, cách tiếp cận nào được xem là chính xác?`,
    `Phát biểu nào về ${topic} là đúng?`,
    `Ứng dụng thực tế nào gắn với ${topic}?`,
  ]

  return Array.from({ length: count }, (_, index) => {
    const stem = stems[index % stems.length] ?? stems[0]!

    return {
      prompt: `${stem} (câu mẫu ${index + 1})`,
      options: [
        `Đáp án đúng về ${topic}`,
        `Phương án nhiễu A cho ${topic}`,
        `Phương án nhiễu B cho ${topic}`,
        `Phương án nhiễu C cho ${topic}`,
      ],
      correct_index: 0,
      explanation: `Đây là câu hỏi mẫu do chế độ ngoại tuyến tạo ra. Hãy sửa lại nội dung cho phù hợp với ${topic}, hoặc đặt AI_PROVIDER cùng API key để dùng model thật.`,
    }
  })
}

// ── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Chỉ hỗ trợ POST.' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const authorization = request.headers.get('Authorization')

    if (!supabaseUrl || !anonKey) {
      return json({ error: 'Edge Function thiếu biến môi trường Supabase.' }, 500)
    }

    if (!authorization) {
      return json({ error: 'Bạn cần đăng nhập.' }, 401)
    }

    // Optional shared secret so only our own front end can spend provider quota.
    const expectedToken = Deno.env.get('AI_ASSIST_TOKEN')
    if (expectedToken && request.headers.get('x-ai-assist-token') !== expectedToken) {
      return json({ error: 'Yêu cầu không hợp lệ.' }, 403)
    }

    // Call policy as the caller, not as the service role, so `is_teacher()`
    // reflects their real profile.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    })

    const { data: isTeacher, error: roleError } = await userClient.rpc('is_teacher')

    if (roleError) {
      return json({ error: `Không kiểm tra được quyền: ${roleError.message}` }, 500)
    }

    if (isTeacher !== true) {
      return json({ error: 'Chỉ tài khoản giáo viên mới dùng được AI Assist.' }, 403)
    }

    const body = (await request.json()) as Partial<GenerateRequest>
    const topic = String(body.topic ?? '').trim()

    if (topic.length < 3) {
      return json({ error: 'Hãy mô tả chủ đề dài hơn một chút (ít nhất 3 ký tự).' }, 400)
    }

    const input: GenerateRequest = {
      topic,
      level: body.level ?? null,
      difficulty: body.difficulty ?? 'medium',
      count: clampCount(body.count),
      notes: body.notes ?? null,
    }

    const count = input.count ?? 10
    const providerSetting = (Deno.env.get('AI_PROVIDER') ?? 'mock').toLowerCase()
    const chatProvider = resolveChatProvider(providerSetting)

    let result: { questions: GeneratedQuestion[]; provider: string }

    if (providerSetting === 'gemini' || chatProvider) {
      const prompt = buildPrompt(input, count)

      try {
        result = chatProvider
          ? await generateWithChatProvider(chatProvider, prompt, count)
          : await generateWithGemini(prompt, count)
      } catch (providerError) {
        // Bad configuration is the operator's problem, not the teacher's: say
        // so instead of quietly handing back placeholder questions.
        if (providerError instanceof ConfigError) throw providerError

        // A dead provider should not dead-end the teacher mid-lesson.
        console.error('AI provider failed, falling back to mock:', providerError)
        result = {
          questions: generateMock(input, count),
          provider: 'mock:fallback',
        }
      }
    } else {
      result = { questions: generateMock(input, count), provider: 'mock' }
    }

    if (result.questions.length === 0) {
      return json(
        {
          error:
            'Không tạo được câu hỏi nào. Hãy mô tả chủ đề cụ thể hơn rồi thử lại.',
        },
        502,
      )
    }

    return json({
      questions: result.questions,
      provider: result.provider,
      request: { topic: input.topic, count, difficulty: input.difficulty },
    })
  } catch (error) {
    console.error('ai-quiz failed:', error)
    return json(
      { error: error instanceof Error ? error.message : 'Lỗi không xác định.' },
      500,
    )
  }
})
