import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export type BadgeTone =
  | 'neon'
  | 'violet'
  | 'magenta'
  | 'spark'
  | 'lime'
  | 'correct'
  | 'wrong'
  | 'neutral'

const TONES: Record<BadgeTone, string> = {
  neon: 'border-neon-400/40 bg-neon-400/10 text-neon-300',
  violet: 'border-violet-glow-400/40 bg-violet-glow-500/10 text-violet-glow-300',
  magenta: 'border-magenta-400/40 bg-magenta-500/10 text-magenta-400',
  spark: 'border-spark-400/40 bg-spark-400/10 text-spark-300',
  lime: 'border-lime-neon-400/40 bg-lime-neon-400/10 text-lime-neon-400',
  correct: 'border-correct-400/40 bg-correct-500/10 text-correct-300',
  wrong: 'border-wrong-400/40 bg-wrong-500/10 text-wrong-300',
  neutral: 'border-ink-600 bg-ink-800/70 text-ink-200',
}

export function Badge({
  children,
  className,
  tone = 'neon',
  icon: Icon,
}: {
  children: ReactNode
  className?: string
  tone?: BadgeTone
  icon?: LucideIcon
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.14em]',
        TONES[tone],
        className,
      )}
    >
      {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
      {children}
    </span>
  )
}

/** Maps the design-system accent stored on a topic to a badge tone. */
export const ACCENT_TO_TONE: Record<string, BadgeTone> = {
  neon: 'neon',
  violet: 'violet',
  magenta: 'magenta',
  spark: 'spark',
  lime: 'lime',
}

export function accentTone(accent: string | null | undefined): BadgeTone {
  if (!accent) return 'neutral'
  return ACCENT_TO_TONE[accent] ?? 'neutral'
}
