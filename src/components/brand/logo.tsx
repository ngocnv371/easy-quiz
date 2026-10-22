import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { AiTechXMark, EasyQuizMark } from './marks'

interface LogoProps {
  className?: string
  markClassName?: string
  /** Hide the wordmark, leaving only the mark (used on narrow screens). */
  compact?: boolean
  /** A small line under the wordmark, e.g. the current mode. */
  tagline?: ReactNode
}

/** Header lockup: the mark plus the Easy Quiz wordmark. */
export function EasyQuizLogo({ className, markClassName, compact = false, tagline }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <EasyQuizMark className={cn('size-8 shrink-0', markClassName)} />
      <span className={cn('flex flex-col', compact && 'sr-only sm:not-sr-only')}>
        <span
          className={cn(
            'font-display text-lg font-semibold tracking-tight',
            tagline && 'leading-tight',
          )}
        >
          <span className="text-ink-50">Easy</span>
          <span className="text-gradient-spark"> Quiz</span>
        </span>
        {tagline ? <span className="text-ink-400 text-[0.65rem] leading-tight">{tagline}</span> : null}
      </span>
    </span>
  )
}

/**
 * "Một sản phẩm của AiTechX" — the credit line that ties a product back to the
 * parent brand, used in the footer and on the landing page.
 */
export function BrandCredit({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'text-ink-300 inline-flex items-center gap-2 text-xs tracking-wide',
        className,
      )}
    >
      <AiTechXMark className="size-4" />
      <span>
        Một sản phẩm của <span className="text-ink-100 font-medium">AiTechX</span>
      </span>
    </span>
  )
}
