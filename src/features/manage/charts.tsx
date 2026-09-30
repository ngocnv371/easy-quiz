/**
 * The report's charts, drawn with plain divs rather than a charting library.
 *
 * A dependency such as Recharts or Chart.js would add hundreds of kilobytes to
 * the teacher console for two bar charts, and neither library prints reliably
 * without extra work. Bars are simple enough to express as flex columns: the
 * height is a percentage of the tallest value, and every colour comes from the
 * design tokens, which the print stylesheet flips to a light theme in one place.
 *
 * Charts are decorative here — the numbers beside every bar are real text — so
 * each chart is a single `role="img"` with a summarising label and its internals
 * are hidden from assistive tech.
 */

import { cn } from '@/lib/utils'

export type ChartTone = 'neon' | 'violet' | 'spark' | 'correct' | 'wrong' | 'neutral'

const FILL: Record<ChartTone, string> = {
  neon: 'bg-gradient-to-t from-neon-500 via-neon-400 to-neon-300',
  violet: 'bg-gradient-to-t from-violet-glow-600 via-violet-glow-500 to-violet-glow-400',
  spark: 'bg-gradient-to-t from-spark-500 via-spark-400 to-spark-300',
  correct: 'bg-gradient-to-t from-correct-500 via-correct-400 to-correct-300',
  wrong: 'bg-gradient-to-t from-wrong-500 via-wrong-400 to-wrong-300',
  neutral: 'bg-ink-500',
}

const SOLID: Record<ChartTone, string> = {
  neon: 'bg-neon-400',
  violet: 'bg-violet-glow-400',
  spark: 'bg-spark-400',
  correct: 'bg-correct-400',
  wrong: 'bg-wrong-400',
  neutral: 'bg-ink-400',
}

export interface ChartDatum {
  label: string
  value: number
  tone?: ChartTone
}

/**
 * A column chart. Values sit above each bar and the category below, so the
 * chart stays legible when it is printed in greyscale.
 */
export function VerticalBarChart({
  data,
  ariaLabel,
  tone = 'neon',
  suffix = '',
  className,
}: {
  data: ChartDatum[]
  ariaLabel: string
  tone?: ChartTone
  suffix?: string
  className?: string
}) {
  const max = Math.max(1, ...data.map((item) => item.value))

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn('flex items-end gap-2 sm:gap-3', className)}
    >
      {data.map((item, index) => {
        // A visible stub for any non-zero value, so a bucket of 1 is not
        // indistinguishable from an empty one.
        const height = item.value <= 0 ? 0 : Math.max(5, (item.value / max) * 100)

        return (
          <div
            key={`${item.label}-${index}`}
            aria-hidden
            className="flex min-w-0 flex-1 flex-col items-center gap-2"
          >
            <span className="text-ink-100 text-xs font-semibold tabular-nums">
              {item.value}
              {suffix}
            </span>

            <div className="bg-ink-800/60 relative flex h-36 w-full items-end justify-center overflow-hidden rounded-lg">
              <div
                className={cn('w-full rounded-t-lg', FILL[item.tone ?? tone])}
                style={{ height: `${height}%` }}
              />
            </div>

            <span className="text-ink-400 w-full text-center text-[0.7rem] leading-tight">
              {item.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** A thin horizontal meter, used for per-question accuracy. */
export function MeterBar({
  percent,
  tone = 'neon',
  className,
}: {
  percent: number
  tone?: ChartTone
  className?: string
}) {
  const clamped = Math.max(0, Math.min(100, percent))

  return (
    <div className={cn('bg-ink-800 h-2 w-full overflow-hidden rounded-full', className)}>
      <div
        className={cn('h-full rounded-full', SOLID[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

/** Green when most people got it, amber when mixed, red when most missed it. */
export function accuracyTone(percent: number): ChartTone {
  if (percent >= 70) return 'correct'
  if (percent >= 40) return 'spark'
  return 'wrong'
}
