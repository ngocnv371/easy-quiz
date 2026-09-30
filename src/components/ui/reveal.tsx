import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

import { EASE, REVEAL_DURATION, STAGGER } from '@/lib/motion'
import { cn } from '@/lib/utils'

interface RevealProps {
  children: ReactNode
  className?: string
  delay?: number
  /** Vertical offset in pixels before the element settles into place. */
  y?: number
  x?: number
  scale?: number
  duration?: number
}

/** Fades and slides its children in the first time they scroll into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  x = 0,
  scale = 1,
  duration = REVEAL_DURATION,
}: RevealProps) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, x, scale }}
      whileInView={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.2, margin: '0px 0px -80px 0px' }}
      transition={{ duration, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Reveals each child in turn. Cheaper than hand-writing a delay per item and
 * keeps the cadence consistent across the app.
 */
export function RevealList({
  children,
  className,
  itemClassName,
  step = STAGGER,
  baseDelay = 0,
}: {
  children: ReactNode[]
  className?: string
  itemClassName?: string
  step?: number
  baseDelay?: number
}) {
  return (
    <div className={className}>
      {children.map((child, index) => (
        <Reveal
          key={index}
          className={itemClassName}
          delay={baseDelay + index * step}
          y={18}
        >
          {child}
        </Reveal>
      ))}
    </div>
  )
}

interface SectionHeadingProps {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  align?: 'left' | 'center'
  className?: string
  titleClassName?: string
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
  className,
  titleClassName,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
    >
      {eyebrow ? (
        <Reveal>
          <span className="text-neon-400 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.26em]">
            <span className="via-neon-400 h-px w-8 bg-gradient-to-r from-transparent to-neon-400" />
            {eyebrow}
          </span>
        </Reveal>
      ) : null}

      <Reveal delay={0.06}>
        <h2
          className={cn(
            'font-display max-w-3xl text-3xl font-semibold sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]',
            titleClassName,
          )}
        >
          {title}
        </h2>
      </Reveal>

      {description ? (
        <Reveal delay={0.12}>
          <p
            className={cn(
              'text-ink-300 max-w-2xl text-base leading-relaxed sm:text-lg',
              align === 'center' && 'mx-auto',
            )}
          >
            {description}
          </p>
        </Reveal>
      ) : null}
    </div>
  )
}
