import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Flame, Infinity as InfinityIcon, Layers, Trophy, Users } from 'lucide-react'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, Skeleton } from '@/components/ui/feedback'
import { Modal } from '@/components/ui/modal'
import { Reveal } from '@/components/ui/reveal'
import { fetchTopics } from '@/features/quiz/api'
import { fetchEndlessLeaderboard, fetchTopicLeaderboard } from '@/features/quiz/endless-api'
import { TopicScopePicker } from '@/features/quiz/topic-scope-picker'
import { formatCompact, formatPercent, formatRelative, medalFor } from '@/lib/format'
import { usePageMeta } from '@/lib/seo'
import { useAsyncData } from '@/lib/use-async-data'
import { cn } from '@/lib/utils'

/**
 * Two boards, both earned in Endless and scored by the server:
 *   · Vô tận (the default): each player's best correct-answer streak in one run
 *   · Theo chủ đề: correct answers in one topic, or across every topic, all-time
 * The board and topic live in the URL (`?board=topics&topic=<slug>`), so a
 * board can be shared.
 */
export function LeaderboardPage() {
  const [params, setParams] = useSearchParams()
  const topicsMode = params.get('board') === 'topics'
  const topicSlug = topicsMode ? params.get('topic') : null
  const [pickerOpen, setPickerOpen] = useState(false)

  const topics = useAsyncData('leaderboard:topics', fetchTopics, topicsMode)
  const topic = (topics.data ?? []).find((item) => item.slug === topicSlug) ?? null

  const streaks = useAsyncData('leaderboard:endless', () => fetchEndlessLeaderboard(50), !topicsMode)
  const byTopic = useAsyncData(`leaderboard:topic:${topicSlug ?? 'all'}`, () => fetchTopicLeaderboard(topicSlug, 50), topicsMode)

  usePageMeta({
    title: topicsMode ? `Bảng xếp hạng — ${topic?.name ?? 'Tất cả chủ đề'}` : 'Bảng xếp hạng',
    description:
      'Bảng xếp hạng Easy Quiz: chuỗi trả lời đúng dài nhất và số câu đúng theo từng chủ đề ở chế độ vô tận.',
    path: '/leaderboard',
  })

  const show = (board: 'endless' | 'topics', slug: string | null = null) =>
    setParams(() => {
      const next = new URLSearchParams()
      if (board === 'topics') {
        next.set('board', 'topics')
        if (slug) next.set('topic', slug)
      }
      return next
    })

  return (
    <div className="relative">
      <AuroraBackground />

      <div className="container-page relative py-14">
        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="max-w-2xl">
          <Badge tone="spark" icon={Trophy}>
            Bảng xếp hạng
          </Badge>

          <h1 className="font-display mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
            Ai đang <span className="text-gradient-spark">dẫn đầu</span>?
          </h1>

          <p className="text-ink-300 mt-3 text-base leading-relaxed">
            Mỗi câu trả lời ở chế độ vô tận đều được máy chủ chấm và ghi vào bảng: chuỗi đúng dài
            nhất trong một lượt chơi, và số câu đúng theo từng chủ đề.
          </p>
        </div>

        {/* ── Board switch ─────────────────────────────────────────── */}
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="border-ink-600 bg-ink-800/60 inline-flex self-start rounded-full border p-1"
            role="tablist"
            aria-label="Kiểu bảng xếp hạng"
          >
            <ModeTab active={!topicsMode} onClick={() => show('endless')} icon={InfinityIcon} label="Chuỗi vô tận" />
            <ModeTab active={topicsMode} onClick={() => show('topics')} icon={Layers} label="Theo chủ đề" />
          </div>

          {topicsMode ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
              className="min-w-0 justify-start gap-2 self-start sm:max-w-sm"
              data-cy="leaderboard-topic"
            >
              <Layers className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">
                {topic ? `${topic.emoji} ${topic.name}` : 'Tất cả chủ đề'}
              </span>
              <span className="text-ink-400 shrink-0 text-xs font-normal">· Đổi</span>
            </Button>
          ) : null}
        </div>

        {/* ── Body ─────────────────────────────────────────────────── */}
        <div className="mt-10">
          {topicsMode ? (
            <Board
              loading={byTopic.loading}
              error={byTopic.error}
              entries={(byTopic.data ?? []).map((entry) => ({
                ...entry,
                score: (
                  <>
                    <CheckCircle2 className="size-4" aria-hidden />
                    {formatCompact(entry.correct)}
                  </>
                ),
                podiumNote: `câu đúng · ${formatPercent(entry.accuracy)} chính xác`,
                rowNote: `${formatCompact(entry.answered)} câu đã làm · ${formatPercent(entry.accuracy)}`,
              }))}
              empty={{
                icon: Layers,
                title: topic ? `Chưa ai luyện "${topic.name}"` : 'Chưa có ai lên bảng',
                description: 'Luyện chủ đề này ở chế độ vô tận — mỗi câu đúng đều được tính.',
              }}
            />
          ) : (
            <Board
              loading={streaks.loading}
              error={streaks.error}
              entries={(streaks.data ?? []).map((entry) => ({
                ...entry,
                score: (
                  <>
                    <Flame className="size-4" aria-hidden />
                    {entry.best_streak}
                  </>
                ),
                podiumNote: `chuỗi dài nhất · ${entry.best_correct} câu đúng`,
                rowNote: `${entry.session_count} lượt chơi · ${formatRelative(entry.last_played_at)}`,
              }))}
              empty={{
                icon: InfinityIcon,
                title: 'Chưa có chuỗi nào lên bảng',
                description: 'Chơi chế độ vô tận và trả lời đúng liên tiếp để ghi tên mình vào bảng này.',
              }}
            />
          )}
        </div>
      </div>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        icon={Layers}
        tone="violet"
        title="Chọn chủ đề"
        description="Chọn lớp, môn rồi chủ đề — hoặc xem tất cả chủ đề."
      >
        {topics.data ? (
          <TopicScopePicker
            topics={topics.data}
            activeSlug={topicSlug}
            onSelect={(slug) => {
              show('topics', slug)
              setPickerOpen(false)
            }}
          />
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
      </Modal>
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Trophy
  label: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200',
        active ? 'bg-ink-700 text-ink-50' : 'text-ink-400 hover:text-ink-100',
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  )
}

interface BoardEntry {
  user_id: string
  username: string
  display_name: string
  avatar_emoji: string
  /** The number the board ranks by, with its icon. */
  score: ReactNode
  podiumNote: string
  rowNote: string
}

/** A podium for the top three, then a list. Both boards share it; only what they rank by differs. */
function Board({
  loading,
  error,
  entries,
  empty,
}: {
  loading: boolean
  error: string | null
  entries: BoardEntry[]
  empty: { icon: typeof Trophy; title: string; description: string }
}) {
  if (loading) return <BoardSkeleton />
  if (error) return <EmptyState icon={Trophy} title="Không tải được bảng xếp hạng" description={error} />
  if (entries.length === 0) return <EmptyState icon={empty.icon ?? Users} title={empty.title} description={empty.description} />

  const podium = entries.slice(0, 3)
  const rest = entries.slice(3)

  return (
    <div className="space-y-8" data-cy="leaderboard-board">
      <div className="grid gap-4 sm:grid-cols-3">
        {podium.map((entry, index) => (
          <Reveal key={entry.user_id} delay={index * 0.08}>
            <Card className={cn('p-5 text-center', index === 0 && 'border-spark-400/40 shadow-glow-spark')}>
              <p className="text-3xl" aria-hidden>
                {medalFor(index + 1)}
              </p>
              <p className="mt-2 text-3xl" aria-hidden>
                {entry.avatar_emoji}
              </p>
              <p className="font-display text-ink-50 mt-2 truncate text-base font-semibold">
                <PlayerName entry={entry} />
              </p>
              <p className="font-display text-gradient-spark mt-1 inline-flex items-center gap-1.5 text-2xl font-bold tabular-nums">
                {entry.score}
              </p>
              <p className="text-ink-400 mt-1 text-xs">{entry.podiumNote}</p>
            </Card>
          </Reveal>
        ))}
      </div>

      {rest.length > 0 ? (
        <Card className="overflow-hidden">
          <ul className="divide-ink-600/60 divide-y">
            {rest.map((entry, index) => (
              <li key={entry.user_id} className="hover:bg-ink-800/40 flex items-center gap-4 px-5 py-3.5 transition-colors">
                <span className="text-ink-400 w-8 text-sm tabular-nums">{index + 4}</span>
                <span className="text-lg" aria-hidden>
                  {entry.avatar_emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink-100 truncate text-sm font-medium">
                    <PlayerName entry={entry} />
                  </p>
                  <p className="text-ink-400 text-xs">{entry.rowNote}</p>
                </div>
                <p className="text-spark-300 inline-flex shrink-0 items-center justify-end gap-1 text-right text-sm font-semibold tabular-nums">
                  {entry.score}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}

function PlayerName({ entry }: { entry: Pick<BoardEntry, 'username' | 'display_name'> }) {
  return entry.username ? (
    <Link to={`/u/${entry.username}`} className="hover:text-neon-300 transition-colors">
      {entry.display_name}
    </Link>
  ) : (
    <>{entry.display_name}</>
  )
}

function BoardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index} className="p-5">
            <Skeleton className="mx-auto size-10 rounded-full" />
            <Skeleton className="mx-auto mt-3 h-4 w-24" />
            <Skeleton className="mx-auto mt-2 h-7 w-16" />
          </Card>
        ))}
      </div>

      <Card className="p-5">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-4 py-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </Card>
    </div>
  )
}
