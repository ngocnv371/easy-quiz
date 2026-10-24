// What a question's options mean, and whether an answer is right. The only place answers are judged.
//   single        one option is the key; the answer is the option picked
//   true_false    each option is a statement and is_correct its truth; the answer marks every one, and
//                 is right only when every mark matches (a missing mark is a wrong one)
//   short_answer  each option is an accepted answer; the typed text is right when it matches one of them,
//                 as text (case, accents and spacing ignored) or, when both read as numbers, by value: 0,5 = 0.5 = 1/2
export const KINDS = ['single', 'true_false', 'short_answer'] as const
export type Kind = (typeof KINDS)[number]

export interface KeyedOption {
  id: string
  label: string
  is_correct: boolean
}

// What the player sent for one question. Only the field that fits the question's kind is read.
export interface Given {
  option_id?: string | null
  marks?: Record<string, boolean> | null
  text?: string | null
}

export interface Graded {
  is_correct: boolean
  // the option picked, for single
  option_id: string | null
  // the marks (JSON) or the text, as attempt_answers.response stores it; null when nothing was given
  response: string | null
  marks: Record<string, boolean> | null
  text: string | null
}

const MAX_TEXT = 200

// Case, accents (đ included) and runs of spaces don't make two answers different: "ha noi" is
// "Hà Nội", since players on a keyboard without Vietnamese input can't type the marks.
const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

// A number as people write it: 12, -3, 2.5, 2,5 (Vietnamese decimal comma), 3/4, -1/2, 1 1/2. Null otherwise.
export function readNumber(raw: string): number | null {
  const value = raw.trim().replace(/\s+/g, ' ').replace(/ ?\/ ?/g, '/')
  const decimal = (s: string) => (/^[+-]?\d+(?:[.,]\d+)?$/.test(s) ? Number(s.replace(',', '.')) : null)
  const plain = decimal(value)
  if (plain !== null) return plain
  const fraction = /^([+-]?)(?:(\d+) )?(\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)$/.exec(value)
  if (!fraction) return null
  const [, sign, whole, top, bottom] = fraction
  const denominator = decimal(bottom!)!
  if (denominator === 0) return null
  const magnitude = (whole ? Number(whole) : 0) + decimal(top!)! / denominator
  return sign === '-' ? -magnitude : magnitude
}

export function matchesShortAnswer(text: string, accepted: string): boolean {
  if (normalizeText(text) === normalizeText(accepted)) return true
  const a = readNumber(text)
  const b = readNumber(accepted)
  return a !== null && b !== null && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
}

export function grade(kind: string, options: KeyedOption[], given: Given | undefined): Graded {
  if (kind === 'true_false') {
    // only marks for this question's own statements are kept
    const marks: Record<string, boolean> = {}
    const sent = given?.marks && typeof given.marks === 'object' ? given.marks : {}
    for (const o of options) if (typeof sent[o.id] === 'boolean') marks[o.id] = sent[o.id]!
    const any = Object.keys(marks).length > 0
    return {
      is_correct: options.length > 0 && options.every((o) => marks[o.id] === o.is_correct),
      option_id: null,
      response: any ? JSON.stringify(marks) : null,
      marks: any ? marks : null,
      text: null,
    }
  }
  if (kind === 'short_answer') {
    const text = typeof given?.text === 'string' ? given.text.trim().slice(0, MAX_TEXT) : ''
    return {
      is_correct: text !== '' && options.some((o) => o.is_correct && matchesShortAnswer(text, o.label)),
      option_id: null,
      response: text || null,
      marks: null,
      text: text || null,
    }
  }
  // the option must belong to this question, otherwise it can't be right
  const chosen = options.find((o) => o.id === given?.option_id)
  return { is_correct: Boolean(chosen?.is_correct), option_id: chosen?.id ?? null, response: null, marks: null, text: null }
}
