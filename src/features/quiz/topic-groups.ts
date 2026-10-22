import type { TopicRow } from '@/lib/domain'

/**
 * Groups the flat topic list into Lớp › Môn › Chủ đề for the subject pickers.
 *
 * Imported question banks name each chapter topic `<Môn> <Lớp> · <Chương>`
 * (e.g. "Toán 5 · Chủ đề 1: Ôn tập và bổ sung"), so the hierarchy is read off
 * the name rather than stored. Anything that does not follow the pattern lands
 * in `other` and is listed flat.
 */

export interface TopicChapter {
  topic: TopicRow
  /** "Chủ đề 1", "Chương IV", "Unit 1–3" — null when the name has no prefix. */
  kicker: string | null
  /** The chapter title, without the subject/grade prefix or the kicker. */
  title: string
}

export interface SubjectGroup {
  /** Stable key within a grade, e.g. "Toán". */
  name: string
  emoji: string
  chapters: TopicChapter[]
}

export interface GradeGroup {
  grade: number
  subjects: SubjectGroup[]
}

export interface TopicTree {
  grades: GradeGroup[]
  other: TopicRow[]
}

const NAME_PATTERN = /^(.+?)\s+(\d{1,2})\s*·\s*(.+)$/
const KICKER_PATTERN = /^((?:Chủ đề|Chương|Unit|Bài)\s+[^:]+?)\s*:\s*(.+)$/i
const ORDER_PATTERN = /^(?:Chủ đề|Chương|Unit|Bài)\s+([IVXLC]+|\d+)/i

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 }

function romanToInt(value: string): number {
  let total = 0
  for (let index = 0; index < value.length; index += 1) {
    const current = ROMAN[value[index]!] ?? 0
    const next = ROMAN[value[index + 1] ?? ''] ?? 0
    total += current < next ? -current : current
  }
  return total
}

/** Textbook order: "Mở đầu" first, then by chapter number (Roman or Arabic). */
function chapterOrder(rest: string): number {
  if (/^mở đầu/i.test(rest)) return 0
  const match = ORDER_PATTERN.exec(rest)
  if (!match) return Number.POSITIVE_INFINITY
  const token = match[1]!
  return /^\d+$/.test(token) ? Number(token) : romanToInt(token.toUpperCase())
}

function splitChapter(rest: string): { kicker: string | null; title: string } {
  const match = KICKER_PATTERN.exec(rest)
  return match ? { kicker: match[1]!, title: match[2]! } : { kicker: null, title: rest }
}

export function groupTopics(topics: TopicRow[]): TopicTree {
  const grades = new Map<number, Map<string, (TopicChapter & { order: number })[]>>()
  const other: TopicRow[] = []

  for (const topic of topics) {
    const match = NAME_PATTERN.exec(topic.name.trim())
    if (!match) {
      other.push(topic)
      continue
    }

    const [, subject, gradeText, rest] = match as unknown as [string, string, string, string]
    const grade = Number(gradeText)
    const subjects = grades.get(grade) ?? new Map()
    grades.set(grade, subjects)

    const chapters = subjects.get(subject) ?? []
    subjects.set(subject, chapters)
    chapters.push({ topic, ...splitChapter(rest), order: chapterOrder(rest) })
  }

  const collator = new Intl.Collator('vi')

  return {
    grades: [...grades.entries()]
      .sort(([a], [b]) => a - b)
      .map(([grade, subjects]) => ({
        grade,
        subjects: [...subjects.entries()]
          .sort(([a], [b]) => collator.compare(a, b))
          .map(([name, chapters]) => ({
            name,
            emoji: chapters[0]?.topic.emoji ?? '🧠',
            chapters: chapters
              .sort((a, b) => a.order - b.order || collator.compare(a.title, b.title))
              .map(({ order: _order, ...chapter }) => chapter),
          })),
      })),
    other,
  }
}

/** Where a topic sits in the tree, so a picker can open at the current scope. */
export function locateTopic(
  tree: TopicTree,
  slug: string | null,
): { grade: number; subject: string } | null {
  if (!slug) return null

  for (const grade of tree.grades) {
    for (const subject of grade.subjects) {
      if (subject.chapters.some((chapter) => chapter.topic.slug === slug)) {
        return { grade: grade.grade, subject: subject.name }
      }
    }
  }

  return null
}

/** "Tiểu học" / "THCS" / "THPT" for a grade number. */
export function schoolLevel(grade: number): string {
  if (grade <= 5) return 'Tiểu học'
  if (grade <= 9) return 'THCS'
  return 'THPT'
}
