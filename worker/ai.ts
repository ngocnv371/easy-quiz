// AI Assist for admins: a one-line brief in, ready-to-edit multiple-choice questions out.
//
// The provider key lives in the Worker's secrets, never in the browser. AI_PROVIDER picks the
// adapter: `gemini`, `openai`, `deepseek` (OpenAI-compatible, so OPENAI_BASE_URL turns `openai`
// into an escape hatch for OpenRouter, Groq, vLLM, Ollama…), or `mock`, which needs no key and is
// also the fallback when a provider errors. A missing key is reported, not masked.
//
// Each generation costs AI_CREDIT_COST credits from profiles.ai_credits, taken up front (one
// guarded update, so parallel calls can't overspend) and handed back if no paid provider actually
// produced the questions, so mock runs are free. Every movement is in ai_credit_ledger.
import type { Env, Member } from './env.ts'
import { AppError, NOW, toInt, uuid } from './sql.ts'

interface GenerateInput {
  topic: string
  level: string | null
  difficulty: 'easy' | 'medium' | 'hard'
  count: number
  notes: string | null
}

interface GeneratedQuestion {
  prompt: string
  options: string[]
  correct_index: number
  explanation: string
}

// misconfiguration (a missing key) rather than an outage: surfaced, not hidden behind mock questions
class ConfigError extends Error {}

const MAX_COUNT = 20
const MIN_COUNT = 3

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'dễ (nhớ và nhận biết)',
  medium: 'trung bình (hiểu và vận dụng)',
  hard: 'khó (phân tích và suy luận)',
}

function buildPrompt(input: GenerateInput): string {
  return [
    `Bạn là người soạn đề trắc nghiệm cho ${input.level?.trim() || 'người học phổ thông'}.`,
    `Hãy soạn đúng ${input.count} câu hỏi trắc nghiệm bằng tiếng Việt về chủ đề: "${input.topic}".`,
    `Mức độ: ${DIFFICULTY_LABELS[input.difficulty] ?? DIFFICULTY_LABELS.medium}.`,
    input.notes?.trim() ? `Yêu cầu thêm: ${input.notes.trim()}` : '',
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

// The model was asked for a shape; check we got it. A malformed question is dropped, not guessed.
function coerceQuestions(raw: unknown, expected: number): GeneratedQuestion[] {
  const list = (raw as { questions?: unknown } | null)?.questions
  if (!Array.isArray(list)) return []
  const questions: GeneratedQuestion[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : ''
    const explanation = typeof record.explanation === 'string' ? record.explanation.trim() : ''
    const options = Array.isArray(record.options)
      ? record.options.filter((o): o is string => typeof o === 'string').map((o) => o.trim()).filter(Boolean)
      : []
    const correct = Number.parseInt(String(record.correct_index ?? record.correctIndex ?? ''), 10)
    if (prompt === '' || options.length < 2 || !Number.isInteger(correct) || correct < 0 || correct >= options.length) continue
    questions.push({ prompt, options, correct_index: correct, explanation })
  }
  return questions.slice(0, expected)
}

// JSON out of a model reply: some endpoints ignore response_format, some wrap it in a ```json fence.
function extractJson(text: string): unknown {
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    return JSON.parse(unfenced)
  } catch {
    const start = unfenced.indexOf('{')
    const end = unfenced.lastIndexOf('}')
    if (start !== -1 && end > start) return JSON.parse(unfenced.slice(start, end + 1))
    throw new Error('Model không trả về JSON hợp lệ.')
  }
}

async function generateWithGemini(env: Env, prompt: string, count: number) {
  const apiKey = env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new ConfigError('Thiếu GEMINI_API_KEY cho nhà cung cấp Gemini (wrangler secret put GEMINI_API_KEY).')
  const model = env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
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
  })
  if (!res.ok) throw new Error(`Gemini trả về lỗi ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const payload = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  return { questions: coerceQuestions(JSON.parse(text), count), provider: `gemini:${model}` }
}

interface ChatProvider {
  label: string
  displayName: string
  keyEnv: string
  apiKey: string | undefined
  model: string
  baseUrl: string
}

function resolveChatProvider(env: Env, setting: string): ChatProvider | null {
  if (setting === 'deepseek') {
    return {
      label: 'deepseek',
      displayName: 'DeepSeek',
      keyEnv: 'DEEPSEEK_API_KEY',
      apiKey: env.DEEPSEEK_API_KEY?.trim() || env.OPENAI_API_KEY?.trim(),
      model: env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat',
      baseUrl: env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com/v1',
    }
  }
  if (setting === 'openai' || setting === 'compatible' || setting === 'openai-compatible') {
    const baseUrl = env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1'
    const official = baseUrl.replace(/\/+$/, '').toLowerCase() === 'https://api.openai.com/v1'
    return {
      label: official ? 'openai' : 'openai-compatible',
      displayName: official ? 'OpenAI' : `điểm cuối tương thích OpenAI (${baseUrl})`,
      keyEnv: 'OPENAI_API_KEY',
      apiKey: env.OPENAI_API_KEY?.trim(),
      model: env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
      baseUrl,
    }
  }
  return null
}

async function generateWithChat(provider: ChatProvider, prompt: string, count: number) {
  if (!provider.apiKey) throw new ConfigError(`Thiếu API key cho ${provider.displayName}. Đặt ${provider.keyEnv} (wrangler secret put ${provider.keyEnv}).`)
  const trimmed = provider.baseUrl.trim().replace(/\/+$/, '')
  const url = /\/chat\/completions$/.test(trimmed) ? trimmed : `${trimmed}/chat/completions`
  const send = (jsonMode: boolean) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.8,
        // most compatible endpoints accept this; the ones that reject it are retried without
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: 'Bạn là người soạn đề trắc nghiệm. Chỉ trả về JSON hợp lệ.' },
          { role: 'user', content: prompt },
        ],
      }),
    })
  let res = await send(true)
  if (res.status === 400) {
    const detail = await res.text()
    if (!/response_format|json_object|json mode|unsupported/i.test(detail)) throw new Error(`${provider.displayName} trả về lỗi 400: ${detail.slice(0, 300)}`)
    res = await send(false)
  }
  if (!res.ok) throw new Error(`${provider.displayName} trả về lỗi ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return { questions: coerceQuestions(extractJson(payload.choices?.[0]?.message?.content ?? ''), count), provider: `${provider.label}:${provider.model}` }
}

// Scaffolding questions, honest about what they are: keeps the flow working before any key exists.
function generateMock(input: GenerateInput): GeneratedQuestion[] {
  const topic = input.topic || 'chủ đề đã chọn'
  const stems = [
    `Khái niệm nào sau đây mô tả đúng nhất về ${topic}?`,
    `Điểm then chốt cần nhớ khi học ${topic} là gì?`,
    `Trong ${topic}, cách tiếp cận nào được xem là chính xác?`,
    `Phát biểu nào về ${topic} là đúng?`,
    `Ứng dụng thực tế nào gắn với ${topic}?`,
  ]
  return Array.from({ length: input.count }, (_, i) => ({
    prompt: `${stems[i % stems.length]} (câu mẫu ${i + 1})`,
    options: [`Đáp án đúng về ${topic}`, `Phương án nhiễu A cho ${topic}`, `Phương án nhiễu B cho ${topic}`, `Phương án nhiễu C cho ${topic}`],
    correct_index: 0,
    explanation: `Đây là câu hỏi mẫu do chế độ ngoại tuyến tạo ra. Hãy sửa lại nội dung cho phù hợp với ${topic}, hoặc đặt AI_PROVIDER cùng API key để dùng model thật.`,
  }))
}

// Moves the member's credits by `delta` and logs it. A spend is refused (returns null) when the
// balance can't cover it: the check and the update are one statement.
async function moveCredits(db: D1Database, userId: string, delta: number, reason: string, count: number | null, provider: string | null) {
  const [moved] = await db.batch([
    db.prepare(`update profiles set ai_credits = ai_credits + ?2, updated_at = ${NOW} where id = ?1 and ai_credits + ?2 >= 0 returning ai_credits`)
      .bind(userId, delta),
    db.prepare(`insert into ai_credit_ledger (id, user_id, delta, balance_after, reason, question_count, provider)
        select ?1, ?2, ?3, ai_credits, ?4, ?5, ?6 from profiles where id = ?2 and changes() = 1`)
      .bind(uuid(), userId, delta, reason.slice(0, 40), count, provider?.slice(0, 80) ?? null),
  ])
  return (moved!.results[0] as { ai_credits: number } | undefined)?.ai_credits ?? null
}

export async function generateQuestions(env: Env, member: Member, body: Record<string, unknown>) {
  const topic = String(body.topic ?? '').trim()
  if (topic.length < 3) throw new AppError('Hãy mô tả chủ đề dài hơn một chút (ít nhất 3 ký tự).')
  const difficulty = body.difficulty === 'easy' || body.difficulty === 'hard' ? body.difficulty : 'medium'
  const input: GenerateInput = {
    topic,
    level: typeof body.level === 'string' ? body.level : null,
    difficulty,
    count: Math.min(MAX_COUNT, Math.max(MIN_COUNT, toInt(body.count, 10))),
    notes: typeof body.notes === 'string' ? body.notes : null,
  }

  const setting = (env.AI_PROVIDER ?? 'mock').toLowerCase()
  const chat = resolveChatProvider(env, setting)
  const paid = setting === 'gemini' || chat !== null
  const costSetting = toInt(env.AI_CREDIT_COST, 1)
  const cost = paid ? (costSetting >= 0 ? costSetting : 1) : 0

  let balance: number | null = null
  let reserved = 0
  if (cost > 0) {
    balance = await moveCredits(env.DB, member.id, -cost, 'generation', input.count, setting)
    if (balance === null) throw new AppError('Bạn đã dùng hết credit AI. Hãy nạp thêm credit để tiếp tục soạn đề.', 402, 'insufficient_credits')
    reserved = cost
  }
  // best effort: a failed refund mustn't turn a working generation into an error
  const refund = async (reason: string) => {
    if (!reserved) return
    reserved = 0
    try {
      balance = (await moveCredits(env.DB, member.id, cost, reason, null, null)) ?? balance
    } catch (e) {
      console.error('ai: credit refund failed', e)
    }
  }

  let result: { questions: GeneratedQuestion[]; provider: string }
  if (paid) {
    const prompt = buildPrompt(input)
    try {
      result = chat ? await generateWithChat(chat, prompt, input.count) : await generateWithGemini(env, prompt, input.count)
    } catch (e) {
      if (e instanceof ConfigError) {
        await refund('refund:config')
        throw new AppError(e.message, 500)
      }
      // a dead provider shouldn't dead-end an admin mid-lesson; the placeholders aren't worth a credit
      console.error('AI provider failed, falling back to mock:', e)
      result = { questions: generateMock(input), provider: 'mock:fallback' }
      await refund('refund:fallback')
    }
  } else {
    result = { questions: generateMock(input), provider: 'mock' }
  }

  if (result.questions.length === 0) {
    await refund('refund:empty')
    throw new AppError('Không tạo được câu hỏi nào. Hãy mô tả chủ đề cụ thể hơn rồi thử lại.', 502)
  }
  if (balance === null) balance = await env.DB.prepare('select ai_credits from profiles where id = ?').bind(member.id).first<number>('ai_credits')
  return { questions: result.questions, provider: result.provider, credits: balance }
}
