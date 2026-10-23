// Bulk question import for admins: a CSV in, one quiz per subject out.
//
// The CSV rules live only here: parse (RFC 4180), map the columns, reject bad rows with a reason,
// group the rest by subject. Then, in one batch (one transaction), each subject is upserted into
// `topics`, its import quiz upserted (found by owner + topic among quizzes with imported_at set, so
// a re-import replaces that quiz's questions instead of piling up copies) and its questions
// replaced. Hand-made quizzes are never touched.
//
// Columns (header row required, aliases in parentheses):
//   subject (topic, môn, chủ đề)          required
//   prompt  (question, câu hỏi)           required
//   option_a … option_f (option_1…6, a…f) at least two, in order
//   correct (answer, đáp án)              letter A–F or 1-based number, default A
//   explanation (giải thích, lời giải)    optional
//   points (điểm), difficulty (độ khó), title (tên đề),
//   status (trạng thái), visibility (hiển thị), subject_slug (slug)  optional
import type { Member } from './env.ts'
import { DIFFICULTIES, STATUSES, VISIBILITIES, freeSlug, replaceQuestions } from './manage.ts'
import { AppError, NOW, oneOf, slugify, trimTo, uuid } from './sql.ts'

// rows above this are refused outright rather than silently cut
const MAX_ROWS = 5000
// kept in the reply so a diagnostic is useful without being a second file
const MAX_SKIPPED_REPORTED = 50

// ---------------------------------------------------------------- CSV

// A small RFC 4180 parser: quoted fields, doubled quotes, commas and newlines inside quotes.
function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '')
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
      } else field += char
      i += 1
      continue
    }
    if (char === '"') inQuotes = true
    else if (char === ',') pushField()
    else if (char === '\n') pushRow()
    else if (char === '\r') {
      // CRLF and a lone CR are one line break
      if (text[i + 1] === '\n') i += 1
      pushRow()
    } else field += char
    i += 1
  }
  if (field !== '' || row.length > 0) pushRow()
  return rows
}

// Lowercase, no Vietnamese accents, the rest collapsed to `_`: `Môn`, `mon` and `  môn  ` are one key.
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
  subject: 'subject', topic: 'subject', mon: 'subject', mon_hoc: 'subject', chu_de: 'subject', subject_name: 'subject',
  prompt: 'prompt', question: 'prompt', cau_hoi: 'prompt', question_text: 'prompt',
  correct: 'correct', answer: 'correct', dap_an: 'correct', dap_an_dung: 'correct', correct_answer: 'correct', correct_index: 'correct',
  explanation: 'explanation', explain: 'explanation', giai_thich: 'explanation', loi_giai: 'explanation',
  points: 'points', diem: 'points',
  difficulty: 'difficulty', do_kho: 'difficulty',
  title: 'title', quiz_title: 'title', ten_de: 'title',
  status: 'status', trang_thai: 'status',
  visibility: 'visibility', hien_thi: 'visibility',
  slug: 'subjectSlug', subject_slug: 'subjectSlug',
}

type Field = 'subject' | 'prompt' | 'correct' | 'explanation' | 'points' | 'difficulty' | 'title' | 'status' | 'visibility' | 'subjectSlug'
type ColumnMap = Partial<Record<Field, number>> & { options: { at: number; order: number }[] }

// `option_a`/`option_1`/`a` -> 1, `option_b`/`option_2`/`b` -> 2, … `f` -> 6
function optionOrder(key: string): number | null {
  const letter = /^(?:option_?)?([a-f])$/.exec(key)
  if (letter) return letter[1]!.charCodeAt(0) - 96
  const number = /^option_?([1-6])$/.exec(key)
  return number ? Number.parseInt(number[1]!, 10) : null
}

function mapColumns(header: string[]): ColumnMap {
  const map: ColumnMap = { options: [] }
  header.forEach((raw, at) => {
    const key = fold(raw)
    if (key === '') return
    const order = optionOrder(key)
    if (order !== null) {
      map.options.push({ at, order })
      return
    }
    const field = FIELD_ALIASES[key] as Field | undefined
    // the first column wins when a header repeats
    if (field && map[field] === undefined) map[field] = at
  })
  map.options.sort((a, b) => a.order - b.order || a.at - b.at)
  return map
}

interface Group {
  subject: { name: string; slug?: string }
  quiz: { title?: string; difficulty?: string; status?: string; visibility?: string }
  questions: { prompt: string; explanation?: string; points?: number; options: { label: string; is_correct?: boolean }[] }[]
}

function parseCorrect(raw: string): number {
  const value = raw.trim()
  if (value === '') return 0
  if (/^[a-fA-F]$/.test(value)) return value.toUpperCase().charCodeAt(0) - 65
  const number = Number.parseInt(value, 10)
  return Number.isFinite(number) ? number - 1 : 0
}

function buildGroups(rows: string[][], headerIndex: number, map: ColumnMap) {
  const groups = new Map<string, Group>()
  const skipped: { row: number; reason: string }[] = []
  let totalRows = 0

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index]!
    const lineNumber = index + 1
    const cell = (at: number | undefined) => (at === undefined ? '' : (row[at] ?? '').trim())
    // a blank separator line inside the sheet is normal
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

    const correctIndex = parseCorrect(cell(map.correct))
    const options: { label: string; is_correct?: boolean }[] = []
    let marked = false
    map.options.forEach((option, position) => {
      const label = (row[option.at] ?? '').trim()
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
      skipped.push({ row: lineNumber, reason: 'Đáp án đúng trỏ vào một lựa chọn trống hoặc nằm ngoài danh sách.' })
      continue
    }

    const points = Number.parseInt(cell(map.points), 10)
    const key = fold(cell(map.subjectSlug) || subjectName)
    let group = groups.get(key)
    if (!group) {
      const difficulty = cell(map.difficulty).toLowerCase()
      const status = cell(map.status).toLowerCase()
      const visibility = cell(map.visibility).toLowerCase()
      group = {
        subject: { name: subjectName, ...(cell(map.subjectSlug) ? { slug: cell(map.subjectSlug) } : {}) },
        quiz: {
          ...(cell(map.title) ? { title: cell(map.title) } : {}),
          ...((DIFFICULTIES as readonly string[]).includes(difficulty) ? { difficulty } : {}),
          ...((STATUSES as readonly string[]).includes(status) ? { status } : {}),
          ...((VISIBILITIES as readonly string[]).includes(visibility) ? { visibility } : {}),
        },
        questions: [],
      }
      groups.set(key, group)
    }
    group.questions.push({
      prompt,
      ...(cell(map.explanation) ? { explanation: cell(map.explanation) } : {}),
      ...(Number.isFinite(points) && points >= 0 ? { points } : {}),
      options,
    })
  }
  return { groups: [...groups.values()], skipped, totalRows }
}

// ---------------------------------------------------------------- writing the bank

async function writeBank(db: D1Database, member: Member, groups: Group[]) {
  const statements: D1PreparedStatement[] = []
  const topicIds = new Map<string, string>() // slug -> id, for subjects seen in this import
  const quizIds = new Map<string, string>() // topic id -> this owner's import quiz
  const usedSlugs = new Set<string>()
  let created = 0
  let questionTotal = 0

  for (const group of groups) {
    const name = group.subject.name.trim().slice(0, 80)
    const topicSlug = (slugify(group.subject.slug || name) || 'chu-de').slice(0, 64)
    let topicId = topicIds.get(topicSlug)
    if (!topicId) {
      topicId = (await db.prepare('select id from topics where slug = ?').bind(topicSlug).first<string>('id')) ?? uuid()
      topicIds.set(topicSlug, topicId)
    }
    statements.push(
      db.prepare(`insert into topics (id, slug, name) values (?, ?, ?)
          on conflict (slug) do update set name = excluded.name`).bind(topicId, topicSlug, name || topicSlug),
    )

    const title = (group.quiz.title?.trim() || `Câu hỏi · ${name || 'Chủ đề'}`).slice(0, 120)
    let quizId = quizIds.get(topicId)
    if (!quizId) {
      quizId = (await db
        .prepare('select id from quizzes where owner_id = ? and topic_id = ? and imported_at is not null order by created_at limit 1')
        .bind(member.id, topicId)
        .first<string>('id')) ?? undefined
      if (quizId) {
        statements.push(
          db.prepare(`update quizzes set topic_id = ?2, title = ?3, description = null,
              difficulty = coalesce(?4, difficulty), visibility = coalesce(?5, visibility), status = coalesce(?6, status),
              published_at = case when coalesce(?6, status) = 'published' then coalesce(published_at, ${NOW}) else null end,
              imported_at = ${NOW}, updated_at = ${NOW} where id = ?1`)
            .bind(quizId, topicId, title, group.quiz.difficulty ?? null, group.quiz.visibility ?? null, group.quiz.status ?? null),
        )
      } else {
        quizId = uuid()
        let slug = await freeSlug(db, title, 'de-nhap-lieu', null)
        if (usedSlugs.has(slug)) slug = `${slug}-${uuid().slice(0, 5)}`
        usedSlugs.add(slug)
        const status = oneOf(STATUSES, group.quiz.status, 'published')
        statements.push(
          db.prepare(`insert into quizzes (id, owner_id, topic_id, slug, title, difficulty, visibility, status, published_at, imported_at)
              values (?, ?, ?, ?, ?, ?, ?, ?, ?, ${NOW})`)
            .bind(quizId, member.id, topicId, slug, title, oneOf(DIFFICULTIES, group.quiz.difficulty, 'medium'),
              oneOf(VISIBILITIES, group.quiz.visibility, 'public'), status, status === 'published' ? new Date().toISOString() : null),
        )
        created += 1
      }
      quizIds.set(topicId, quizId)
    }
    statements.push(...replaceQuestions(db, quizId, group.questions))
    questionTotal += group.questions.length
  }

  await db.batch(statements)
  return { subjects: groups.length, quizzes: created, questions: questionTotal }
}

export async function importQuestions(db: D1Database, member: Member, body: { csv?: unknown; filename?: unknown }) {
  const csv = typeof body.csv === 'string' ? body.csv : ''
  if (csv.trim() === '') throw new AppError('Không đọc được nội dung tệp CSV.')

  const rows = parseCsv(csv)
  const headerIndex = rows.findIndex((cells) => cells.some((cell) => cell.trim() !== ''))
  if (headerIndex === -1) throw new AppError('Tệp CSV trống.')
  if (rows.length - headerIndex - 1 > MAX_ROWS) throw new AppError(`Tệp vượt quá ${MAX_ROWS} câu hỏi mỗi lần nhập.`, 413)

  const map = mapColumns(rows[headerIndex]!)
  if (map.subject === undefined || map.prompt === undefined) {
    throw new AppError('Tệp thiếu cột bắt buộc. Cần có "subject" (môn/chủ đề) và "prompt" (câu hỏi).')
  }
  if (map.options.length < 2) throw new AppError('Tệp cần ít nhất hai cột lựa chọn, ví dụ "option_a" và "option_b".')

  const { groups, skipped, totalRows } = buildGroups(rows, headerIndex, map)
  if (groups.length === 0) {
    throw new AppError('Không có dòng hợp lệ nào để nhập. Xem danh sách dòng bị bỏ qua bên dưới.', 400, 'no_rows', {
      total_rows: totalRows,
      skipped: skipped.slice(0, MAX_SKIPPED_REPORTED),
    })
  }

  const result = await writeBank(db, member, groups)
  return {
    ...result,
    total_rows: totalRows,
    skipped: skipped.slice(0, MAX_SKIPPED_REPORTED),
    skipped_total: skipped.length,
    filename: trimTo(body.filename, 200),
  }
}
