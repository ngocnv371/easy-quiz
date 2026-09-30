import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Clock,
  ListChecks,
  Play,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
} from 'lucide-react'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { Badge, accentTone } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card, Stat } from '@/components/ui/card'
import { EmptyState, Skeleton } from '@/components/ui/feedback'
import { Reveal } from '@/components/ui/reveal'
import { QuizCardTile, DifficultyBadge } from '@/features/quiz/quiz-card-tile'
import {
  fetchPersonalBest,
  fetchQuizCardBySlug,
  fetchQuizCards,
  fetchQuizLeaderboard,
} from '@/features/quiz/api'
import { useAuth } from '@/features/auth/auth-context'
import { formatCompact, formatDuration, medalFor } from '@/lib/format'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAsyncData } from '@/lib/use-async-data'

export function QuizDetailPage() {
  const { slug = '' } = useParams()
  const { user } = useAuth()

  const quiz = useAsyncData(
    `quiz:${slug}`,
    () => fetchQuizCardBySlug(slug),
    isSupabaseConfigured && slug !== '',
  )

  const card = quiz.data

  const board = useAsyncData(
    `quiz-board:${card?.id ?? 'none'}`,
    () => fetchQuizLeaderboard(card!.id, 5),
    Boolean(card?.id),
  )

  const related = useAsyncData(
    `quiz-related:${card?.topic_slug ?? 'none'}:${card?.id ?? ''}`,
    () =>
      fetchQuizCards({ topicSlug: card?.topic_slug ?? null, sort: 'popular', limit: 4 }).then(
        (list) => list.filter((item) => item.id !== card?.id).slice(0, 3),
      ),
    Boolean(card?.topic_slug),
  )

  const best = useAsyncData(
    `quiz-best:${card?.id ?? 'none'}:${user?.id ?? 'anon'}`,
    () => fetchPersonalBest(card!.id, user!.id),
    Boolean(card?.id && user?.id),
  )

  if (quiz.loading) return <DetailSkeleton />

  if (!card) {
    return (
      <div className="container-page py-20">
        <EmptyState
          icon={Target}
          title="Không tìm thấy đề thi"
          description="Đề thi có thể chưa được xuất bản, đã bị ẩn, hoặc đường dẫn không đúng."
          action={
            <ButtonLink to="/explore" variant="secondary">
              Về thư viện đề thi
            </ButtonLink>
          }
        />
      </div>
    )
  }

  return (
    <div className="relative">
      <AuroraBackground variant="quiz" />

      <div className="container-page relative py-10">
        <Link
          to="/explore"
          className="text-ink-400 hover:text-neon-300 inline-flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Thư viện đề thi
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          {/* ── Main column ────────────────────────────────────────── */}
          <div>
            <Reveal>
              <Card className="p-6 sm:p-8">
                <div className="flex flex-wrap items-start gap-5">
                  <span
                    className="border-ink-600 bg-ink-800/70 flex size-16 items-center justify-center rounded-2xl border text-3xl"
                    aria-hidden
                  >
                    {card.cover_emoji}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {card.topic_name ? (
                        <Badge tone={accentTone(card.topic_accent)}>
                          <span aria-hidden>{card.topic_emoji}</span>
                          {card.topic_name}
                        </Badge>
                      ) : null}
                      <DifficultyBadge difficulty={card.difficulty} />
                      {card.ai_generated ? (
                        <Badge tone="spark" icon={Sparkles}>
                          AI Assist
                        </Badge>
                      ) : null}
                    </div>

                    <h1 className="font-display mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                      {card.title}
                    </h1>

                    {card.description ? (
                      <p className="text-ink-300 mt-3 text-sm leading-relaxed sm:text-base">
                        {card.description}
                      </p>
                    ) : null}

                    <p className="text-ink-400 mt-4 text-xs">
                      Soạn bởi{' '}
                      <span className="text-ink-200 font-medium">
                        {card.author_avatar} {card.author_name ?? 'Ẩn danh'}
                      </span>
                    </p>
                  </div>
                </div>

                <dl className="border-ink-600/60 mt-7 grid grid-cols-2 gap-6 border-t pt-6 sm:grid-cols-4">
                  <Stat
                    label="Số câu"
                    value={card.question_count}
                    hint={<span className="inline-flex items-center gap-1"><ListChecks className="size-3" /> câu hỏi</span>}
                  />
                  <Stat
                    label="Thời gian"
                    value={card.time_limit_seconds > 0 ? formatDuration(card.time_limit_seconds) : 'Tự do'}
                    hint={<span className="inline-flex items-center gap-1"><Clock className="size-3" /> cho cả bài</span>}
                  />
                  <Stat
                    label="Lượt chơi"
                    value={formatCompact(card.attempt_count)}
                    hint={<span className="inline-flex items-center gap-1"><Users className="size-3" /> người đã làm</span>}
                  />
                  <Stat
                    label="Điểm tối đa"
                    value={formatCompact(card.max_score)}
                    hint={<span className="inline-flex items-center gap-1"><Trophy className="size-3" /> tổng điểm</span>}
                  />
                </dl>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <ButtonLink to={`/q/${card.slug}/play`} size="lg">
                    <Play className="size-4" aria-hidden />
                    {best.data && best.data > 0 ? 'Chơi lại' : 'Bắt đầu làm bài'}
                  </ButtonLink>

                  {!user ? (
                    <p className="text-ink-400 text-xs">
                      Không cần tài khoản — bạn chỉ cần đặt tên hiển thị để lên bảng xếp hạng.
                    </p>
                  ) : best.data && best.data > 0 ? (
                    <p className="text-spark-300 inline-flex items-center gap-1.5 text-sm">
                      <Star className="size-4" aria-hidden />
                      Kỷ lục của bạn: {best.data} điểm
                    </p>
                  ) : null}
                </div>
              </Card>
            </Reveal>

            {/* ── Related ──────────────────────────────────────────── */}
            {related.data && related.data.length > 0 ? (
              <section className="mt-10">
                <h2 className="font-display text-ink-50 text-lg font-semibold">
                  Đề thi cùng chủ đề
                </h2>

                <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {related.data.map((item, index) => (
                    <Reveal key={item.id} delay={index * 0.06} y={16}>
                      <QuizCardTile quiz={item} />
                    </Reveal>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          {/* ── Sidebar ────────────────────────────────────────────── */}
          <aside className="space-y-6">
            <Reveal delay={0.1}>
              <Card className="overflow-hidden">
                <div className="border-ink-600/60 flex items-center justify-between border-b px-5 py-4">
                  <h2 className="text-ink-50 inline-flex items-center gap-2 text-sm font-semibold">
                    <Trophy className="text-spark-400 size-4" aria-hidden />
                    Dẫn đầu đề này
                  </h2>
                  <Link
                    to={`/leaderboard?quiz=${card.slug}`}
                    className="text-neon-300 hover:text-neon-200 text-xs transition-colors"
                  >
                    Xem tất cả
                  </Link>
                </div>

                {board.loading ? (
                  <div className="space-y-3 p-5">
                    {Array.from({ length: 3 }, (_, index) => (
                      <Skeleton key={index} className="h-9 w-full" />
                    ))}
                  </div>
                ) : (board.data ?? []).length === 0 ? (
                  <div className="text-ink-400 p-6 text-center text-sm">
                    Chưa ai hoàn thành đề này.
                    <br />
                    <span className="text-neon-300">Bạn có thể là người đầu tiên!</span>
                  </div>
                ) : (
                  <ul className="divide-ink-600/60 divide-y">
                    {(board.data ?? []).map((entry, index) => (
                      <li key={entry.attempt_id} className="flex items-center gap-3 px-5 py-3">
                        <span className="w-6 text-sm" aria-hidden>
                          {medalFor(index + 1) || (
                            <span className="text-ink-500 tabular-nums">{index + 1}</span>
                          )}
                        </span>
                        <span aria-hidden>{entry.avatar_emoji}</span>

                        <span className="text-ink-200 min-w-0 flex-1 truncate text-sm">
                          {entry.display_name}
                        </span>

                        <span className="text-spark-300 text-sm font-semibold tabular-nums">
                          {entry.score}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </Reveal>

            <Reveal delay={0.16}>
              <Card className="p-5">
                <h2 className="text-ink-50 text-sm font-semibold">Mẹo làm bài</h2>
                <ul className="text-ink-300 mt-3 space-y-2.5 text-sm leading-relaxed">
                  <li className="flex gap-2.5">
                    <span className="text-neon-400" aria-hidden>
                      ·
                    </span>
                    Đáp án chỉ được chấm sau khi bạn nộp bài, nên cứ bình tĩnh đọc kỹ.
                  </li>
                  <li className="flex gap-2.5">
                    <span className="text-neon-400" aria-hidden>
                      ·
                    </span>
                    Bạn có thể quay lại câu trước để đổi đáp án trước khi nộp.
                  </li>
                  <li className="flex gap-2.5">
                    <span className="text-spark-400" aria-hidden>
                      ·
                    </span>
                    Điểm số được máy chủ chấm, nên kết quả trên bảng xếp hạng là thật.
                  </li>
                </ul>
              </Card>
            </Reveal>
          </aside>
        </div>
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="container-page py-10">
      <Skeleton className="h-5 w-32" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="p-8">
          <div className="flex gap-5">
            <Skeleton className="size-16 rounded-2xl" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          <Skeleton className="mt-8 h-16 w-full" />
          <Skeleton className="mt-8 h-12 w-48 rounded-full" />
        </Card>
        <Card className="h-64 p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-32 w-full" />
        </Card>
      </div>
    </div>
  )
}
