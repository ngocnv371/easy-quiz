import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { VISIBILITY_LABELS } from '@/lib/labels'
import type { QuizCard, QuizVisibility } from '@/lib/domain'
import { cn } from '@/lib/utils'

const ACCENT_TILE: Record<string, string> = {
  neon: 'border-neon-400/40 bg-neon-400/10',
  violet: 'border-violet-glow-400/40 bg-violet-glow-500/10',
  magenta: 'border-magenta-400/40 bg-magenta-500/10',
  spark: 'border-spark-400/40 bg-spark-400/10',
  lime: 'border-lime-neon-400/40 bg-lime-neon-400/10',
  neutral: 'border-ink-600 bg-ink-800/70',
}

/** Compact row used inside the admin console, where density matters more. */
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
          {quiz.question_count} câu · {VISIBILITY_LABELS[quiz.visibility as QuizVisibility] ?? quiz.visibility}
        </p>
      </div>

      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}
