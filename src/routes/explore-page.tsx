import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronRight, Compass, GraduationCap, Search, SlidersHorizontal, X } from 'lucide-react'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, Skeleton } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/field'
import { Reveal } from '@/components/ui/reveal'
import { QuizCardTile } from '@/features/quiz/quiz-card-tile'
import { fetchQuizCards, fetchTopics, type QuizSort } from '@/features/quiz/api'
import { groupTopics, locateTopic, schoolLevel } from '@/features/quiz/topic-groups'
import { DIFFICULTY_LABELS } from '@/lib/labels'
import type { QuizDifficulty } from '@/lib/domain'
import { usePageMeta } from '@/lib/seo'
import { useAsyncData } from '@/lib/use-async-data'
import { cn } from '@/lib/utils'

const SORTS: { value: QuizSort; label: string }[] = [
  { value: 'new', label: 'Mới nhất' },
  { value: 'popular', label: 'Nhiều lượt chơi' },
  { value: 'alphabetical', label: 'Theo tên A→Z' },
]

export function ExplorePage() {
  // Filters live in the query string; the canonical stays on the bare path so
  // every permutation consolidates onto one URL.
  usePageMeta({
    title: 'Thư viện đề thi',
    description:
      'Khám phá đề trắc nghiệm theo chủ đề, độ khó và lượt chơi. Mọi đề đều chơi được ngay — không cần tài khoản.',
    path: '/explore',
  })

  const [params, setParams] = useSearchParams()

  const topicSlug = params.get('topic')
  const difficulty = params.get('difficulty') as QuizDifficulty | null
  const sort = (params.get('sort') as QuizSort | null) ?? 'new'

  // The search box is local so typing stays snappy; the URL catches up after a
  // short pause, which keeps back/forward and link sharing working.
  const [search, setSearch] = useState(params.get('q') ?? '')

  useEffect(() => {
    const current = params.get('q') ?? ''
    if (search === current) return

    const timer = window.setTimeout(() => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          if (search.trim() === '') next.delete('q')
          else next.set('q', search.trim())
          return next
        },
        { replace: true },
      )
    }, 350)

    return () => window.clearTimeout(timer)
  }, [search, params, setParams])

  const topics = useAsyncData('explore:topics', fetchTopics)

  // Topics are browsed as Lớp › Môn › Chủ đề. `grade` and `subject` narrow to
  // every chapter beneath them; a `topic` alone (an old link) implies both.
  const tree = useMemo(() => groupTopics(topics.data ?? []), [topics.data])
  const located = locateTopic(tree, topicSlug)
  const grade = located?.grade ?? (Number(params.get('grade')) || null)
  const subjectName = located?.subject ?? params.get('subject')
  const gradeGroup = tree.grades.find((group) => group.grade === grade) ?? null
  const subjectGroup = gradeGroup?.subjects.find((group) => group.name === subjectName) ?? null

  const groupSlugs = topicSlug
    ? null
    : subjectGroup
      ? subjectGroup.chapters.map((chapter) => chapter.topic.slug)
      : gradeGroup
        ? gradeGroup.subjects.flatMap((group) => group.chapters.map((chapter) => chapter.topic.slug))
        : null

  // A grade/subject filter can only be resolved once the topic list is in.
  const scopeReady = topicSlug !== null || grade === null || !topics.loading

  const queryKey = `explore:${topicSlug ?? ''}:${groupSlugs?.join(',') ?? ''}:${difficulty ?? ''}:${sort}:${params.get('q') ?? ''}`

  const quizzes = useAsyncData(
    queryKey,
    () =>
      fetchQuizCards({
        topicSlug,
        topicSlugs: groupSlugs,
        difficulty,
        sort,
        search: params.get('q') ?? '',
        limit: 60,
      }),
    scopeReady,
  )

  /** Moves the topic filter; each level clears the levels beneath it. */
  const setScope = (scope: { grade?: number | null; subject?: string | null; topic?: string | null }) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      for (const key of ['grade', 'subject', 'topic'] as const) {
        const value = scope[key]
        if (value === undefined || value === null) next.delete(key)
        else next.set(key, String(value))
      }
      return next
    })
  }

  const patchParam = (key: string, value: string | null) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
      return next
    })
  }

  const hasFilters = Boolean(topicSlug || grade || difficulty || params.get('q'))

  return (
    <div className="relative">
      <AuroraBackground variant="quiz" />

      <div className="container-page relative py-14">
        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="max-w-2xl">
          <Badge tone="neon" icon={Compass}>
            Thư viện đề thi
          </Badge>

          <h1 className="font-display mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
            Hôm nay bạn muốn <span className="text-gradient-spark">chinh phục</span> gì?
          </h1>

          <p className="text-ink-300 mt-3 text-base leading-relaxed">
            Chọn một chủ đề, hoặc tìm theo tên đề thi. Mọi đề đều chơi được ngay — không cần tài
            khoản.
          </p>
        </div>

        {/* ── Controls ─────────────────────────────────────────────── */}
        <div className="mt-8 flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search
                className="text-ink-400 pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm đề thi, chủ đề…"
                aria-label="Tìm đề thi"
                className="pl-10"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Xoá tìm kiếm"
                  className="text-ink-400 hover:text-ink-100 absolute top-1/2 right-3 -translate-y-1/2"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>

            <div className="flex gap-3">
              <Select
                value={difficulty ?? ''}
                onChange={(event) => patchParam('difficulty', event.target.value || null)}
                aria-label="Độ khó"
                className="sm:w-40"
              >
                <option value="">Mọi độ khó</option>
                {(['easy', 'medium', 'hard'] as const).map((value) => (
                  <option key={value} value={value}>
                    {DIFFICULTY_LABELS[value]}
                  </option>
                ))}
              </Select>

              <Select
                value={sort}
                onChange={(event) => patchParam('sort', event.target.value)}
                aria-label="Sắp xếp"
                className="sm:w-48"
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* ── Topic filter: Lớp › Môn › Chủ đề ───────────────────── */}
          {topics.data && topics.data.length > 0 ? (
            <div className="flex flex-col gap-2.5" data-cy="explore-topic-filter">
              <FilterRow icon={SlidersHorizontal} label="Chủ đề">
                <FilterChip
                  active={!topicSlug && !gradeGroup}
                  onClick={() => setScope({})}
                  label="Tất cả"
                />

                {tree.grades.map((group) => (
                  <FilterChip
                    key={group.grade}
                    active={gradeGroup?.grade === group.grade}
                    onClick={() =>
                      setScope({ grade: gradeGroup?.grade === group.grade ? null : group.grade })
                    }
                    label={`Lớp ${group.grade}`}
                    title={schoolLevel(group.grade)}
                  />
                ))}

                {tree.other.map((topic) => (
                  <FilterChip
                    key={topic.id}
                    active={topicSlug === topic.slug}
                    onClick={() => setScope({ topic: topicSlug === topic.slug ? null : topic.slug })}
                    label={topic.name}
                    emoji={topic.emoji}
                  />
                ))}
              </FilterRow>

              {gradeGroup ? (
                <FilterRow icon={GraduationCap} label={`Lớp ${gradeGroup.grade}`}>
                  {gradeGroup.subjects.map((group) => (
                    <FilterChip
                      key={group.name}
                      active={subjectGroup?.name === group.name}
                      onClick={() =>
                        setScope({
                          grade: gradeGroup.grade,
                          subject: subjectGroup?.name === group.name ? null : group.name,
                        })
                      }
                      label={group.name}
                      emoji={group.emoji}
                    />
                  ))}
                </FilterRow>
              ) : null}

              {gradeGroup && subjectGroup ? (
                <FilterRow icon={ChevronRight} label={subjectGroup.name}>
                  {subjectGroup.chapters.map((chapter) => (
                    <FilterChip
                      key={chapter.topic.id}
                      active={topicSlug === chapter.topic.slug}
                      onClick={() =>
                        setScope({
                          grade: gradeGroup.grade,
                          subject: subjectGroup.name,
                          topic: topicSlug === chapter.topic.slug ? null : chapter.topic.slug,
                        })
                      }
                      label={chapter.kicker ? `${chapter.kicker}: ${chapter.title}` : chapter.title}
                    />
                  ))}
                </FilterRow>
              ) : null}

            </div>
          ) : null}

          {hasFilters ? (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setParams(new URLSearchParams())
                }}
              >
                <X className="size-3.5" aria-hidden />
                Xoá bộ lọc
              </Button>
            </div>
          ) : null}
        </div>

        {/* ── Results ──────────────────────────────────────────────── */}
        <div className="mt-10">
          {quizzes.loading ? (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <Card key={index} className="p-5">
                  <div className="flex gap-3.5">
                    <Skeleton className="size-11 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                  <Skeleton className="mt-4 h-3 w-full" />
                  <Skeleton className="mt-2 h-3 w-2/3" />
                  <Skeleton className="mt-4 h-6 w-32 rounded-full" />
                </Card>
              ))}
            </div>
          ) : quizzes.error ? (
            <EmptyState
              icon={Compass}
              title="Không tải được danh sách"
              description={quizzes.error}
            />
          ) : (quizzes.data ?? []).length === 0 ? (
            <EmptyState
              icon={Search}
              title="Không tìm thấy đề thi nào"
              description="Thử một chủ đề khác, hoặc xoá bộ lọc để xem toàn bộ thư viện."
            />
          ) : (
            <>
              <p className="text-ink-400 mb-5 text-sm">
                {quizzes.data?.length} đề thi
              </p>

              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {(quizzes.data ?? []).map((quiz, index) => (
                  <Reveal key={quiz.id} delay={Math.min(index, 6) * 0.05} y={16}>
                    <QuizCardTile quiz={quiz} />
                  </Reveal>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function FilterRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Compass
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <span className="text-ink-400 inline-flex shrink-0 items-center gap-1.5 pt-1.5 text-xs sm:w-24">
        <Icon className="size-3.5" aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  emoji,
  title,
}: {
  active: boolean
  onClick: () => void
  label: string
  emoji?: string
  /** Hover text, for chips whose label is an abbreviation. */
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-200',
        active
          ? 'border-neon-400/60 bg-neon-400/15 text-neon-200'
          : 'border-ink-600 bg-ink-800/60 text-ink-300 hover:border-ink-500 hover:text-ink-100',
      )}
    >
      {emoji ? <span aria-hidden>{emoji}</span> : null}
      {label}
    </button>
  )
}
