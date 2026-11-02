import { useMemo } from 'react'
import { Infinity as InfinityIcon, LineChart, Sparkles, Target, Trophy } from 'lucide-react'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card, Stat } from '@/components/ui/card'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { useAuth } from '@/features/auth/auth-context'
import { fetchMyEndlessStats } from '@/features/quiz/endless-api'
import { MIN_ANSWERED, STEADY_ACCURACY, areaStrength, sortByStrength } from '@/features/quiz/endless-progress'
import { TopicProgressList } from '@/features/quiz/topic-progress-list'
import { formatCompact, formatPercent, formatRelative } from '@/lib/format'
import type { EndlessTopicProgress } from '@/lib/domain'
import { usePageMeta } from '@/lib/seo'
import { useAsyncData } from '@/lib/use-async-data'

/** How many topics "Nên luyện thêm" suggests. */
const SUGGESTIONS = 3

/**
 * The player's own progress, all from Endless: how much they have answered and
 * how well, the few topics most worth practising (each one tap from Endless on
 * that topic), and every topic they have touched.
 */
export function ProgressPage() {
  const { user, isGuest, displayName } = useAuth()

  // Personal and signed-in only — keep it out of the index.
  usePageMeta({
    title: 'Tiến độ học tập',
    description: 'Số câu đã làm, độ chính xác theo từng chủ đề và gợi ý chủ đề nên luyện thêm.',
    path: '/progress',
    noIndex: true,
  })

  const stats = useAsyncData(`progress:endless:${user?.id ?? 'none'}`, fetchMyEndlessStats, Boolean(user?.id))
  const topics = useMemo(() => sortByStrength(stats.data?.topics ?? []), [stats.data])

  // Weakest first, among topics with enough answers to judge and below "improving".
  const suggestions = useMemo(
    () =>
      topics
        .filter((topic) => topic.answered >= MIN_ANSWERED && topic.accuracy < STEADY_ACCURACY)
        .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered)
        .slice(0, SUGGESTIONS),
    [topics],
  )

  return (
    <div className="relative">
      <AuroraBackground />

      <div className="container-page relative py-14">
        <div className="max-w-2xl">
          <Badge tone="neon" icon={LineChart}>
            Tiến độ học tập
          </Badge>

          <h1 className="font-display mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
            {displayName ? `${displayName}, cùng nhìn lại` : 'Cùng nhìn lại'}{' '}
            <span className="text-gradient">chặng đường của bạn</span>
          </h1>

          <p className="text-ink-300 mt-3 text-base leading-relaxed">
            Mọi câu trả lời ở chế độ vô tận đều được tổng hợp theo chủ đề. Chủ đề nào còn yếu,
            Easy Quiz gợi ý để bạn luyện thêm.
          </p>
        </div>

        <div className="mt-10">
          {stats.loading ? (
            <ProgressSkeleton />
          ) : stats.error ? (
            <EmptyState icon={LineChart} title="Không tải được tiến độ" description={stats.error} />
          ) : !stats.data || stats.data.answered === 0 ? (
            <EmptyState
              icon={InfinityIcon}
              title="Chưa có câu trả lời nào"
              description="Luyện vài câu ở chế độ vô tận và trang này sẽ bắt đầu theo dõi độ chính xác của bạn theo từng chủ đề."
              action={<ButtonLink to="/endless">Bắt đầu luyện tập</ButtonLink>}
            />
          ) : (
            <div className="space-y-8" data-cy="progress">
              {isGuest ? (
                <Alert tone="warning" icon={Sparkles} title="Bạn đang chơi với tư cách khách">
                  Tiến độ được giữ trên thiết bị này. Tạo tài khoản chính thức để đăng nhập lại ở
                  nơi khác mà không mất thành tích.
                  <div className="mt-3">
                    <ButtonLink to="/register" size="sm" variant="spark">
                      Tạo tài khoản
                    </ButtonLink>
                  </div>
                </Alert>
              ) : null}

              <Card className="p-6 sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-ink-50 text-sm font-semibold">Tổng quan</h2>
                  {stats.data.last_played_at ? (
                    <span className="text-ink-400 text-xs">Lần luyện gần nhất {formatRelative(stats.data.last_played_at)}</span>
                  ) : null}
                </div>
                <dl className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
                  <Stat label="Câu đã làm" value={formatCompact(stats.data.answered)} hint={`${formatCompact(stats.data.correct)} câu đúng`} />
                  <Stat label="Chính xác" value={formatPercent(stats.data.accuracy)} />
                  <Stat label="Chuỗi dài nhất" value={stats.data.best_streak} hint="trong một lượt chơi" />
                  <Stat label="Lượt chơi" value={formatCompact(stats.data.runs)} hint={`${topics.length} chủ đề`} />
                </dl>
              </Card>

              {suggestions.length > 0 ? (
                <section aria-labelledby="suggest-heading">
                  <h2 id="suggest-heading" className="font-display text-ink-50 text-lg font-semibold tracking-tight">
                    Nên luyện thêm
                  </h2>
                  <p className="text-ink-400 mt-1 text-sm">
                    Những chủ đề bạn đúng chưa tới {formatPercent(STEADY_ACCURACY)} — luyện riêng từng chủ đề là cách lên tay nhanh nhất.
                  </p>
                  <Card className="mt-4 p-5 sm:p-6">
                    <TopicProgressList areas={suggestions} action={(topic) => <PracticeLink topic={topic} />} />
                  </Card>
                </section>
              ) : (
                <Alert tone="success" icon={Trophy} title="Bạn đang làm rất tốt">
                  Chưa có chủ đề nào dưới {formatPercent(STEADY_ACCURACY)} trong số những chủ đề đã làm từ{' '}
                  {MIN_ANSWERED} câu trở lên. Tiếp tục luyện để mở rộng thêm chủ đề mới nhé.
                </Alert>
              )}

              <section aria-labelledby="topics-heading">
                <h2 id="topics-heading" className="font-display text-ink-50 text-lg font-semibold tracking-tight">
                  Theo chủ đề
                </h2>
                <p className="text-ink-400 mt-1 text-sm">
                  Số câu đúng trên số câu đã trả lời, tính từ trước đến nay. Cần ít nhất {MIN_ANSWERED} câu để xếp loại.
                </p>
                <Card className="mt-4 p-5 sm:p-6">
                  <TopicProgressList areas={topics} action={(topic) => <PracticeLink topic={topic} />} />
                </Card>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Endless, scoped to one topic. */
function PracticeLink({ topic }: { topic: EndlessTopicProgress }) {
  const weak = areaStrength(topic.accuracy, topic.answered) === 'new' && topic.answered >= MIN_ANSWERED
  return (
    <ButtonLink
      to={`/endless?topic=${encodeURIComponent(topic.slug)}`}
      size="sm"
      variant={weak ? 'primary' : 'outline'}
      aria-label={`Luyện chủ đề ${topic.name}`}
      className="px-3"
    >
      <Target className="size-4" aria-hidden />
      <span className="hidden sm:inline">Luyện</span>
    </ButtonLink>
  )
}

function ProgressSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <Skeleton className="h-4 w-24" />
        <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </Card>
      <Card className="space-y-4 p-6">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </Card>
    </div>
  )
}
