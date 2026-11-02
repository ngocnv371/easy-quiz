import type { ReactNode } from 'react'

import type { EndlessTopicProgress } from '@/lib/domain'
import { cn } from '@/lib/utils'

import { AREA_LABELS, areaStrength, type AreaStrength } from './endless-progress'

const STRENGTH_CHIP: Record<AreaStrength, string> = {
  strong: 'border-correct-400/40 bg-correct-500/10 text-correct-300',
  steady: 'border-spark-400/40 bg-spark-400/10 text-spark-300',
  new: 'border-ink-600 bg-ink-800/70 text-ink-300',
}

const STRENGTH_BAR: Record<AreaStrength, string> = {
  strong: 'bg-correct-400',
  steady: 'bg-spark-400',
  new: 'bg-ink-500',
}

/**
 * Topics with their Endless counts: the name gets the whole line (two on a
 * phone), its label beside it, the accuracy bar and "Đúng x/y câu" under it.
 * Shared by the stop summary's skill profile and /progress, which adds a way to
 * practise each one (`action`).
 */
export function TopicProgressList({
  areas,
  action,
  className,
}: {
  areas: EndlessTopicProgress[]
  action?: (area: EndlessTopicProgress) => ReactNode
  className?: string
}) {
  return (
    <ul className={cn('space-y-3', className)}>
      {areas.map((area) => {
        const strength = areaStrength(area.accuracy, area.answered)
        return (
          <li key={area.topic_id} className="flex items-start gap-3">
            <span aria-hidden className="mt-0.5">
              {area.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <span className="text-ink-100 line-clamp-2 min-w-0 text-sm leading-snug sm:truncate">{area.name}</span>
                <span
                  className={cn(
                    'shrink-0 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium whitespace-nowrap sm:text-xs',
                    STRENGTH_CHIP[strength],
                  )}
                >
                  {AREA_LABELS[strength]}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="bg-ink-800 h-1.5 flex-1 overflow-hidden rounded-full">
                  <div
                    className={cn('h-full rounded-full', STRENGTH_BAR[strength])}
                    style={{ width: `${Math.max(area.accuracy, 3)}%` }}
                  />
                </div>
                <span className="text-ink-400 shrink-0 text-xs tabular-nums">
                  Đúng {area.correct}/{area.answered} câu
                </span>
              </div>
            </div>
            {action ? <div className="shrink-0 self-center">{action(area)}</div> : null}
          </li>
        )
      })}
    </ul>
  )
}
