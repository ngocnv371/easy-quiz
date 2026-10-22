import { useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, GraduationCap, Layers } from 'lucide-react'

import {
  groupTopics,
  locateTopic,
  schoolLevel,
  type GradeGroup,
  type SubjectGroup,
} from '@/features/quiz/topic-groups'
import type { TopicRow } from '@/lib/domain'
import { cn } from '@/lib/utils'

/**
 * The Endless subject picker, as a drill-down: Lớp › Môn › Chủ đề.
 *
 * With dozens of chapter topics a flat list is unusable, so the picker opens
 * on the grades and walks down one level per tap. It opens where the current
 * scope lives, so switching to a neighbouring chapter is a single tap.
 */
export function TopicScopePicker({
  topics,
  activeSlug,
  onSelect,
}: {
  topics: TopicRow[]
  activeSlug: string | null
  onSelect: (slug: string | null) => void
}) {
  const tree = useMemo(() => groupTopics(topics), [topics])
  const [initial] = useState(() => locateTopic(tree, activeSlug))
  const [grade, setGrade] = useState<number | null>(initial?.grade ?? null)
  const [subjectName, setSubjectName] = useState<string | null>(initial?.subject ?? null)

  const gradeGroup = tree.grades.find((group) => group.grade === grade) ?? null
  const subject = gradeGroup?.subjects.find((group) => group.name === subjectName) ?? null

  const openGrade = (next: number | null) => {
    setGrade(next)
    setSubjectName(null)
  }

  return (
    <div data-cy="scope-picker">
      {gradeGroup ? (
        <Breadcrumb
          grade={gradeGroup.grade}
          subject={subject?.name ?? null}
          onRoot={() => openGrade(null)}
          onGrade={() => setSubjectName(null)}
        />
      ) : null}

      {subject ? (
        <ChapterList subject={subject} activeSlug={activeSlug} onSelect={onSelect} />
      ) : gradeGroup ? (
        <SubjectList
          group={gradeGroup}
          activeSlug={activeSlug}
          onOpen={setSubjectName}
        />
      ) : (
        <RootList
          grades={tree.grades}
          other={tree.other}
          activeSlug={activeSlug}
          onAll={() => onSelect(null)}
          onGrade={openGrade}
          onSelect={onSelect}
        />
      )}
    </div>
  )
}

// ── Levels ────────────────────────────────────────────────────────────────

function RootList({
  grades,
  other,
  activeSlug,
  onAll,
  onGrade,
  onSelect,
}: {
  grades: GradeGroup[]
  other: TopicRow[]
  activeSlug: string | null
  onAll: () => void
  onGrade: (grade: number) => void
  onSelect: (slug: string) => void
}) {
  return (
    <>
      <ul className="space-y-1">
        <ScopeOption
          active={activeSlug === null}
          glyph={<Layers className="size-4" aria-hidden />}
          title="Tất cả môn"
          subtitle="Trộn câu hỏi từ mọi môn"
          onSelect={onAll}
        />
      </ul>

      {grades.length > 0 ? (
        <>
          <SectionLabel>Theo lớp</SectionLabel>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {grades.map((group) => {
              const containsActive = group.subjects.some((subject) =>
                subject.chapters.some((chapter) => chapter.topic.slug === activeSlug),
              )
              return (
                <li key={group.grade}>
                  <button
                    type="button"
                    data-cy="scope-grade"
                    onClick={() => onGrade(group.grade)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                      containsActive
                        ? 'border-neon-400/50 bg-neon-400/10'
                        : 'border-ink-600/70 bg-ink-800/40 hover:bg-ink-800/80',
                    )}
                  >
                    <span className="font-display text-ink-50 text-xl font-semibold tabular-nums">
                      {group.grade}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-ink-100 block text-sm font-medium">
                        Lớp {group.grade}
                      </span>
                      <span className="text-ink-400 block truncate text-xs">
                        {schoolLevel(group.grade)} · {group.subjects.length} môn
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}

      {other.length > 0 ? (
        <>
          <SectionLabel>{grades.length > 0 ? 'Chủ đề khác' : 'Môn học'}</SectionLabel>
          <ul className="space-y-1">
            {other.map((topic) => (
              <ScopeOption
                key={topic.id}
                active={activeSlug === topic.slug}
                glyph={topic.emoji}
                title={topic.name}
                onSelect={() => onSelect(topic.slug)}
              />
            ))}
          </ul>
        </>
      ) : null}
    </>
  )
}

function SubjectList({
  group,
  activeSlug,
  onOpen,
}: {
  group: GradeGroup
  activeSlug: string | null
  onOpen: (name: string) => void
}) {
  return (
    <ul className="space-y-1">
      {group.subjects.map((subject) => (
        <ScopeOption
          key={subject.name}
          active={subject.chapters.some((chapter) => chapter.topic.slug === activeSlug)}
          glyph={subject.emoji}
          title={subject.name}
          subtitle={`${subject.chapters.length} chủ đề`}
          trailing={<ChevronRight className="text-ink-400 size-4 shrink-0" aria-hidden />}
          onSelect={() => onOpen(subject.name)}
        />
      ))}
    </ul>
  )
}

function ChapterList({
  subject,
  activeSlug,
  onSelect,
}: {
  subject: SubjectGroup
  activeSlug: string | null
  onSelect: (slug: string) => void
}) {
  return (
    <ul className="space-y-1">
      {subject.chapters.map((chapter) => (
        <ScopeOption
          key={chapter.topic.id}
          active={activeSlug === chapter.topic.slug}
          glyph={chapter.topic.emoji}
          title={chapter.title}
          kicker={chapter.kicker ?? undefined}
          onSelect={() => onSelect(chapter.topic.slug)}
        />
      ))}
    </ul>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────────

function Breadcrumb({
  grade,
  subject,
  onRoot,
  onGrade,
}: {
  grade: number
  subject: string | null
  onRoot: () => void
  onGrade: () => void
}) {
  return (
    // Pinned to the top of the modal's scroll body; the negative margins cover
    // the body padding so rows never peek out above it.
    <nav
      aria-label="Vị trí"
      className="bg-ink-900/95 border-ink-600/60 sticky -top-2 z-10 sm:-top-3 -mx-2 -mt-2 mb-2 flex items-center gap-1 border-b px-4 py-2 text-sm backdrop-blur sm:-mx-3 sm:-mt-3 sm:px-5"
    >
      <button
        type="button"
        data-cy="scope-back"
        onClick={subject ? onGrade : onRoot}
        aria-label="Quay lại"
        className="text-ink-300 hover:bg-ink-800/70 hover:text-ink-50 -ml-1.5 rounded-lg p-1.5 transition-colors"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>

      <button
        type="button"
        onClick={onRoot}
        className="text-ink-400 hover:text-ink-100 transition-colors"
      >
        Tất cả
      </button>
      <ChevronRight className="text-ink-600 size-3.5 shrink-0" aria-hidden />

      {subject ? (
        <>
          <button
            type="button"
            onClick={onGrade}
            className="text-ink-400 hover:text-ink-100 inline-flex items-center gap-1 transition-colors"
          >
            <GraduationCap className="size-3.5" aria-hidden />
            Lớp {grade}
          </button>
          <ChevronRight className="text-ink-600 size-3.5 shrink-0" aria-hidden />
          <span className="text-ink-50 truncate font-medium">{subject}</span>
        </>
      ) : (
        <span className="text-ink-50 inline-flex items-center gap-1 font-medium">
          <GraduationCap className="size-3.5" aria-hidden />
          Lớp {grade}
        </span>
      )}
    </nav>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-ink-400 mt-5 mb-2 px-1 text-[0.7rem] font-medium tracking-[0.16em] uppercase">
      {children}
    </p>
  )
}

function ScopeOption({
  active,
  glyph,
  kicker,
  title,
  subtitle,
  trailing,
  onSelect,
}: {
  active: boolean
  glyph: ReactNode
  /** Small line above the title, e.g. "Chương IV". */
  kicker?: string
  title: string
  subtitle?: string
  trailing?: ReactNode
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={trailing ? undefined : active}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
          active ? 'border-neon-400/50 bg-neon-400/10' : 'border-transparent hover:bg-ink-800/60',
        )}
      >
        <span
          className="border-ink-600 bg-ink-800/70 flex size-8 shrink-0 items-center justify-center rounded-lg border text-base"
          aria-hidden
        >
          {glyph}
        </span>

        <span className="min-w-0 flex-1">
          {kicker ? (
            <span className="text-ink-400 block truncate text-xs">{kicker}</span>
          ) : null}
          <span className="text-ink-100 block text-sm font-medium">{title}</span>
          {subtitle ? (
            <span className="text-ink-400 block truncate text-xs">{subtitle}</span>
          ) : null}
        </span>

        {trailing ?? (active ? <Check className="text-neon-300 size-4 shrink-0" aria-hidden /> : null)}
      </button>
    </li>
  )
}
