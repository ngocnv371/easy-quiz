// ═══════════════════════════════════════════════════════════════════════════
// import-questions — bulk question import for the admin console
//
// The admin uploads a CSV on the manage screen. This function is the only
// place that understands the file format: it parses the CSV, validates every
// row, groups the questions by subject, and hands a fully-shaped payload to
// `import_question_bank()` — which upserts the subjects, upserts one quiz per
// subject, and replaces its questions in a single transaction.
//
//   POST /functions/v1/import-questions
//   { csv: "subject,prompt,option_a,...\nToán,…,", filename?: "toan.csv" }
//   → { subjects, quizzes, questions, total_rows, skipped: [{ row, reason }] }
//
// Admin-only. The role is re-checked here and again inside the RPC, so an
// ordinary user can neither reach the write nor spend it by another route.
//
// Accepted columns (header row required, aliases in parentheses):
//   subject (topic, môn, chủ đề)          required
//   prompt  (question, câu hỏi)           required
//   option_a … option_f (option_1…6, a…f) at least two, in order
//   correct (answer, đáp án)              letter A–F or 1-based number, default A
//   explanation (giải thích, lời giải)    optional
//   points (điểm), difficulty (độ khó), title (tên đề),
//   status (trạng thái), visibility (hiển thị), subject_slug (slug)  optional
//
// The subject's emoji is not configurable here: the topic upsert falls back to
// its database default.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Rows above this are refused outright rather than silently truncated. */
const MAX_ROWS = 5000
/** Kept in the response so a diagnostic is useful without being a second file. */
const MAX_SKIPPED_REPORTED = 50

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ── CSV ────────────────────────────────────────────────────────────────────
// A small RFC-4180 parser: quoted fields, doubled quotes, and commas or
// newlines inside quotes are all handled. Deliberately not a dependency — the
// whole grammar the importer needs fits in one pass.

function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  const pushField = () => {
    row.push(field)
    field = ''
  }

  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  while (i < text.length) {
    const char = text[i]!

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }

    if (char === '"') {
      inQuotes = true
      i += 1
      continue
    }

    if (char === ',') {
      pushField()
      i += 1
      continue
    }

    if (char === '\n') {
      pushRow()
      i += 1
      continue
    }

    if (char === '\r') {
      // Treat CRLF and a lone CR as one line break.
      if (text[i + 1] === '\n') i += 1
      pushRow()
      i += 1
      continue
    }

    field += char
    i += 1
  }

  // A final field/row without a trailing newline.
  if (field !== '' || row.length > 0) pushRow()

  return rows
}

// ── Header mapping ─────────────────────────────────────────────────────────

/**
 * Lowercase, strip Vietnamese diacritics, and collapse the rest to `_` so
 * `Môn`, `mon` and `  môn  ` all land on the same key. `đ` has no combining
 * form, so it is folded by hand.
 */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const FIELD_ALIASES: Record<string, string> = {
  subject: 'subject',
  topic: 'subject',
  mon: 'subject',
  mon_hoc: 'subject',
  chu_de: 'subject',
  subject_name: 'subject',
  prompt: 'prompt',
  question: 'prompt',
  cau_hoi: 'prompt',
  question_text: 'prompt',
  correct: 'correct',
  answer: 'correct',
  dap_an: 'correct',
  dap_an_dung: 'correct',
  correct_answer: 'correct',
  correct_index: 'correct',
  explanation: 'explanation',
  explain: 'explanation',
  giai_thich: 'explanation',
  loi_giai: 'explanation',
  points: 'points',
  diem: 'points',
  difficulty: 'difficulty',
  do_kho: 'difficulty',
  title: 'title',
  quiz_title: 'title',
  ten_de: 'title',
  status: 'status',
  trang_thai: 'status',
  visibility: 'visibility',
  hien_thi: 'visibility',
  slug: 'subject_slug',
  subject_slug: 'subject_slug',
}

interface OptionColumn {
  at: number
  order: number
}

interface ColumnMap {
  subject?: number
  prompt?: number
  correct?: number
  explanation?: number
  points?: number
  difficulty?: number
  title?: number
  status?: number
  visibility?: number
  subjectSlug?: number
  options: OptionColumn[]
}

/** `option_a`/`option_1`/`a` → 1, `option_b`/`option_2`/`b` → 2, … `f` → 6. */
function optionOrder(key: string): number | null {
  const letter = /^(?:option_?)?([a-f])$/.exec(key)
  if (letter) return letter[1]!.charCodeAt(0) - 96

  const number = /^option_?([1-6])$/.exec(key)
  if (number) return Number.parseInt(number[1]!, 10)

  return null
}

function mapColumns(header: string[]): ColumnMap {
  const map: ColumnMap = { options: [] }

  header.forEach((rawHeader, at) => {
    const key = fold(rawHeader)
    if (key === '') return

    const order = optionOrder(key)
    if (order !== null) {
      map.options.push({ at, order })
      return
    }

    const field = FIELD_ALIASES[key]
    if (field === undefined || field === 'subject_slug') {
      if (field === 'subject_slug') map.subjectSlug = at
      return
    }

    // First column wins when a header is repeated.
    if (map[field as keyof Omit<ColumnMap, 'options'>] === undefined) {
      map[field as keyof Omit<ColumnMap, 'options'>] = at
    }
  })

  map.options.sort((a, b) => a.order - b.order || a.at - b.at)
  return map
}

// ── Row → payload ──────────────────────────────────────────────────────────

type Group = {
  subject: {
    name: string
    slug?: string
    description?: string
  }
  quiz: {
    title?: string
    difficulty?: string
    status?: string
    visibility?: string
  }
  questions: Array<{
    prompt: string
    explanation?: string
    points?: number
    options: Array<{ label: string; is_correct?: boolean }>
  }>
}

const DIFFICULTIES = new Set(['easy', 'medium', 'hard'])
const STATUSES = new Set(['draft', 'published', 'archived'])
const VISIBILITIES = new Set(['private', 'unlisted', 'public'])

function parseCorrect(raw: string): number {
  const value = raw.trim()
  if (value === '') return 0

  if (/^[a-fA-F]$/.test(value)) return value.toUpperCase().charCodeAt(0) - 65

  const number = Number.parseInt(value, 10)
  if (Number.isFinite(number)) return number - 1

  return 0
}

function buildPayload(rows: string[][], headerIndex: number, map: ColumnMap) {
  const groups = new Map<string, Group>()
  const skipped: Array<{ row: number; reason: string }> = []
  let totalRows = 0

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index]!
    const lineNumber = index + 1
    const cell = (at: number | undefined) => (at === undefined ? '' : (row[at] ?? '').trim())

    // A blank separator line inside the sheet is normal; ignore it quietly.
    if (row.every((value) => value.trim() === '')) continue

    totalRows += 1

    const subjectName = cell(map.subject)
    const prompt = cell(map.prompt)

    if (subjectName === '') {
      skipped.push({ row: lineNumber, reason: 'Thiếu tên môn/chủ đề.' })
      continue
    }
    if (prompt === '') {
      skipped.push({ row: lineNumber, reason: 'Thiếu nội dung câu hỏi.' })
      continue
    }

    const rawOptions = map.options.map((option) => (row[option.at] ?? '').trim())
    const correctIndex = parseCorrect(cell(map.correct))

    const options: Array<{ label: string; is_correct?: boolean }> = []
    let marked = false

    rawOptions.forEach((label, position) => {
      if (label === '') return
      const isCorrect = position === correctIndex
      options.push(isCorrect ? { label, is_correct: true } : { label })
      if (isCorrect) marked = true
    })

    if (options.length < 2) {
      skipped.push({ row: lineNumber, reason: 'Cần ít nhất 2 lựa chọn không trống.' })
      continue
    }
    if (!marked) {
      skipped.push({
        row: lineNumber,
        reason: 'Đáp án đúng trỏ vào một lựa chọn trống hoặc nằm ngoài danh sách.',
      })
      continue
    }

    const pointsRaw = Number.parseInt(cell(map.points), 10)
    const key = fold(cell(map.subjectSlug) || subjectName)

    let group = groups.get(key)
    if (!group) {
      const difficulty = cell(map.difficulty).toLowerCase()
      const status = cell(map.status).toLowerCase()
      const visibility = cell(map.visibility).toLowerCase()

      group = {
        subject: {
          name: subjectName,
          ...(cell(map.subjectSlug) ? { slug: cell(map.subjectSlug) } : {}),
        },
        quiz: {
          ...(cell(map.title) ? { title: cell(map.title) } : {}),
          ...(DIFFICULTIES.has(difficulty) ? { difficulty } : {}),
          ...(STATUSES.has(status) ? { status } : {}),
          ...(VISIBILITIES.has(visibility) ? { visibility } : {}),
        },
        questions: [],
      }
      groups.set(key, group)
    }

    group.questions.push({
      prompt,
      ...(cell(map.explanation) ? { explanation: cell(map.explanation) } : {}),
      ...(Number.isFinite(pointsRaw) && pointsRaw >= 0 ? { points: pointsRaw } : {}),
      options,
    })
  }

  return { groups: [...groups.values()], skipped, totalRows }
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

    // Policy runs as the caller, so `is_admin()` sees their real profile.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    })

    const { data: isAdmin, error: roleError } = await userClient.rpc('is_admin')

    if (roleError) {
      return json({ error: `Không kiểm tra được quyền: ${roleError.message}` }, 500)
    }
    if (isAdmin !== true) {
      return json({ error: 'Chỉ quản trị viên mới nhập được ngân hàng câu hỏi.' }, 403)
    }

    const body = (await request.json()) as { csv?: unknown; filename?: unknown }
    const csv = typeof body.csv === 'string' ? body.csv : ''

    if (csv.trim() === '') {
      return json({ error: 'Không đọc được nội dung tệp CSV.' }, 400)
    }

    const rows = parseCsv(csv)
    const headerIndex = rows.findIndex((cells) => cells.some((cell) => cell.trim() !== ''))

    if (headerIndex === -1) {
      return json({ error: 'Tệp CSV trống.' }, 400)
    }
    if (rows.length - headerIndex - 1 > MAX_ROWS) {
      return json({ error: `Tệp vượt quá ${MAX_ROWS} câu hỏi mỗi lần nhập.` }, 413)
    }

    const map = mapColumns(rows[headerIndex]!)

    if (map.subject === undefined || map.prompt === undefined) {
      return json(
        { error: 'Tệp thiếu cột bắt buộc. Cần có "subject" (môn/chủ đề) và "prompt" (câu hỏi).' },
        400,
      )
    }
    if (map.options.length < 2) {
      return json(
        { error: 'Tệp cần ít nhất hai cột lựa chọn, ví dụ "option_a" và "option_b".' },
        400,
      )
    }

    const { groups, skipped, totalRows } = buildPayload(rows, headerIndex, map)

    if (groups.length === 0) {
      return json(
        {
          error: 'Không có dòng hợp lệ nào để nhập. Xem danh sách dòng bị bỏ qua bên dưới.',
          total_rows: totalRows,
          skipped: skipped.slice(0, MAX_SKIPPED_REPORTED),
        },
        400,
      )
    }

    const { data, error } = await userClient.rpc('import_question_bank', {
      p_payload: { groups },
    })

    if (error) {
      // The RPC's messages are already written for a person; pass them through.
      return json({ error: error.message }, 400)
    }

    const result = (data ?? {}) as { subjects?: number; quizzes?: number; questions?: number }

    return json({
      subjects: result.subjects ?? 0,
      quizzes: result.quizzes ?? 0,
      questions: result.questions ?? 0,
      total_rows: totalRows,
      skipped: skipped.slice(0, MAX_SKIPPED_REPORTED),
      skipped_total: skipped.length,
      filename: typeof body.filename === 'string' ? body.filename : null,
    })
  } catch (error) {
    console.error('import-questions failed:', error)
    return json(
      { error: error instanceof Error ? error.message : 'Lỗi không xác định.' },
      500,
    )
  }
})
