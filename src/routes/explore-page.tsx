import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Compass, Search, SlidersHorizontal, X } from 'lucide-react'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, Skeleton } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/field'
import { Reveal } from '@/components/ui/reveal'
import { QuizCardTile } from '@/features/quiz/quiz-card-tile'
import { fetchQuizCards, fetchTopics, type QuizSort } from '@/features/quiz/api'
import { DIFFICULTY_LABELS } from '@/lib/labels'
import type { QuizDifficulty } from '@/lib/domain'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAsyncData } from '@/lib/use-async-data'
import { cn } from '@/lib/utils'

const SORTS: { value: QuizSort; label: string }[] = [
  { value: 'new', label: 'Mới nhất' },
  { value: 'popular', label: 'Nhiều lượt chơi' },
  { value: 'alphabetical', label: 'Theo tên A→Z' },
]

export function ExplorePage() {
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

  const queryKey = useMemo(
    () => `explore:${topicSlug ?? ''}:${difficulty ?? ''}:${sort}:${params.get('q') ?? ''}`,
    [topicSlug, difficulty, sort, params],
  )

  const topics = useAsyncData('explore:topics', fetchTopics, isSupabaseConfigured)

  const quizzes = useAsyncData(
    queryKey,
    () =>
      fetchQuizCards({
        topicSlug,
        difficulty,
        sort,
        search: params.get('q') ?? '',
        limit: 60,
      }),
    isSupabaseConfigured,
  )

  const patchParam = (key: string, value: string | null) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
      return next
    })
  }

  const hasFilters = Boolean(topicSlug || difficulty || params.get('q'))

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

          {/* ── Topic filter ──────────────────────────────────────── */}
          {topics.data && topics.data.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink-400 mr-1 inline-flex items-center gap-1.5 text-xs">
                <SlidersHorizontal className="size-3.5" aria-hidden />
                Chủ đề
              </span>

              <FilterChip
                active={!topicSlug}
                onClick={() => patchParam('topic', null)}
                label="Tất cả"
              />

              {topics.data.map((topic) => (
                <FilterChip
                  key={topic.id}
                  active={topicSlug === topic.slug}
                  onClick={() =>
                    patchParam('topic', topicSlug === topic.slug ? null : topic.slug)
                  }
                  label={topic.name}
                  emoji={topic.emoji}
                />
              ))}
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
          {!isSupabaseConfigured ? (
            <EmptyState
              icon={Compass}
              title="Chưa kết nối Supabase"
              description="Sao chép .env.example thành .env.local và chạy npm run supabase:start để nạp kho đề thi mẫu."
            />
          ) : quizzes.loading ? (
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

function FilterChip({
  active,
  onClick,
  label,
  emoji,
}: {
  active: boolean
  onClick: () => void
  label: string
  emoji?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
