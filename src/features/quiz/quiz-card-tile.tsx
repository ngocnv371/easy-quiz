import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Clock, ListChecks, Play, Sparkles, Users } from 'lucide-react'

import { Badge, accentTone } from '@/components/ui/badge'
import { CardLink } from '@/components/ui/card'
import { formatCompact, formatDuration } from '@/lib/format'
import { DIFFICULTY_LABELS } from '@/lib/labels'
import type { QuizCard } from '@/lib/domain'
import { cn } from '@/lib/utils'

const ACCENT_TILE: Record<string, string> = {
  neon: 'border-neon-400/40 bg-neon-400/10',
  violet: 'border-violet-glow-400/40 bg-violet-glow-500/10',
  magenta: 'border-magenta-400/40 bg-magenta-500/10',
  spark: 'border-spark-400/40 bg-spark-400/10',
  lime: 'border-lime-neon-400/40 bg-lime-neon-400/10',
  neutral: 'border-ink-600 bg-ink-800/70',
}

export function DifficultyBadge({
  difficulty,
  className,
}: {
  difficulty: QuizCard['difficulty']
  className?: string
}) {
  const tone =
    difficulty === 'easy' ? 'correct' : difficulty === 'hard' ? 'wrong' : 'spark'

  return (
    <Badge tone={tone} className={className}>
      {DIFFICULTY_LABELS[difficulty]}
    </Badge>
  )
}

/** The catalogue tile used on Explore, the landing page and the teacher list. */
export function QuizCardTile({
  quiz,
  href,
  footer,
  className,
}: {
  quiz: QuizCard
  /** Defaults to the public quiz page; the console passes its editor link. */
  href?: string
  footer?: ReactNode
  className?: string
}) {
  const to = href ?? `/q/${quiz.slug}`
  const accent = quiz.topic_accent ?? 'neon'

  return (
    <CardLink to={to} className={cn('h-full', className)}>
      <div className="flex h-full flex-col p-5">
        <div className="flex items-start gap-3.5">
          <span
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl border text-xl',
              ACCENT_TILE[accent] ?? ACCENT_TILE.neon,
            )}
            aria-hidden
          >
            {quiz.cover_emoji}
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="font-display text-ink-50 group-hover:text-neon-300 line-clamp-2 text-base leading-snug font-semibold transition-colors">
              {quiz.title}
            </h3>

            <p className="text-ink-400 mt-1 truncate text-xs">
              {quiz.author_avatar ? `${quiz.author_avatar} ` : ''}
              {quiz.author_name ?? 'Ẩn danh'}
            </p>
          </div>

          {quiz.ai_generated ? (
            <span
              className="text-spark-300 bg-spark-400/10 border-spark-400/30 flex size-7 shrink-0 items-center justify-center rounded-lg border"
              title="Được soạn bằng AI Assist"
            >
              <Sparkles className="size-3.5" aria-hidden />
            </span>
          ) : null}
        </div>

        {quiz.description ? (
          <p className="text-ink-300 mt-3 line-clamp-2 text-sm leading-relaxed">
            {quiz.description}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {quiz.topic_name ? (
            <Badge tone={accentTone(quiz.topic_accent)}>
              <span aria-hidden>{quiz.topic_emoji}</span>
              {quiz.topic_name}
            </Badge>
          ) : null}
          <DifficultyBadge difficulty={quiz.difficulty} />
        </div>

        <dl className="text-ink-400 border-ink-600/60 mt-4 grid grid-cols-3 gap-2 border-t pt-4 text-xs">
          <div className="flex items-center gap-1.5">
            <ListChecks className="size-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Số câu</dt>
            <dd>{quiz.question_count} câu</dd>
          </div>

          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Thời lượng</dt>
            <dd>{quiz.time_limit_seconds > 0 ? formatDuration(quiz.time_limit_seconds) : 'Tự do'}</dd>
          </div>

          <div className="flex items-center gap-1.5 justify-self-end">
            <Users className="size-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Lượt chơi</dt>
            <dd>{formatCompact(quiz.attempt_count)}</dd>
          </div>
        </dl>

        {footer ? <div className="mt-4">{footer}</div> : null}

        <span className="text-neon-300 mt-4 inline-flex items-center gap-1.5 text-sm font-medium opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <Play className="size-3.5" aria-hidden />
          Vào làm bài
        </span>
      </div>
    </CardLink>
  )
}

/** Compact row used inside the teacher console, where density matters more. */
export function QuizListRow({
  quiz,
  actions,
}: {
  quiz: QuizCard
  actions?: ReactNode
}) {
  const accent = quiz.topic_accent ?? 'neon'

  return (
    <div className="border-ink-600/60 bg-ink-900/40 hover:border-ink-500 flex flex-wrap items-center gap-4 rounded-xl border p-4 transition-colors">
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg border text-lg',
          ACCENT_TILE[accent] ?? ACCENT_TILE.neon,
        )}
        aria-hidden
      >
        {quiz.cover_emoji}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/manage/quizzes/${quiz.id}`}
            className="text-ink-50 hover:text-neon-300 truncate font-medium transition-colors"
          >
            {quiz.title}
          </Link>

          <Badge tone={quiz.status === 'published' ? 'correct' : 'neutral'}>
            {quiz.status === 'published' ? 'Đã xuất bản' : quiz.status === 'draft' ? 'Nháp' : 'Lưu trữ'}
          </Badge>

          {quiz.ai_generated ? <Badge tone="spark">AI</Badge> : null}
        </div>

        <p className="text-ink-400 mt-1 text-xs">
          {quiz.question_count} câu · {formatCompact(quiz.play_count)} lượt chơi ·{' '}
          {quiz.visibility === 'public'
            ? 'Công khai'
            : quiz.visibility === 'unlisted'
              ? 'Chia sẻ bằng liên kết'
              : 'Riêng tư'}
        </p>
      </div>

      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}
