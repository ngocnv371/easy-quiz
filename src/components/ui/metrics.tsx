import { useEffect, useRef, useState } from 'react'
import { animate, useInView, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'

/** Counts up to `value` once, the first time it scrolls into view. */
export function Counter({
  value,
  duration = 1.4,
  className,
  suffix,
  prefix,
}: {
  value: number
  duration?: number
  className?: string
  suffix?: string
  prefix?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.4 })
  const reduceMotion = useReducedMotion()
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!inView) return

    if (reduceMotion) {
      setDisplay(value)
      return
    }

    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(latest),
    })

    return () => controls.stop()
  }, [inView, value, duration, reduceMotion])

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {prefix}
      {formatNumber(Math.round(display))}
      {suffix}
    </span>
  )
}

/** A horizontal bar that fills to `percent` when scrolled into view. */
export function ProgressBar({
  percent,
  className,
  barClassName,
}: {
  percent: number
  className?: string
  barClassName?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })
  const clamped = Math.max(0, Math.min(100, percent))

  return (
    <div
      ref={ref}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('bg-ink-800 h-2 w-full overflow-hidden rounded-full', className)}
    >
      <div
        className={cn(
          'h-full rounded-full bg-gradient-to-r from-neon-400 via-violet-glow-400 to-magenta-400 transition-[width] duration-1000 ease-out',
          barClassName,
        )}
        style={{ width: inView ? `${clamped}%` : '0%' }}
      />
    </div>
  )
}

/** An SVG ring used on the result screen for score and accuracy. */
export function ProgressRing({
  percent,
  size = 168,
  strokeWidth = 10,
  className,
  children,
  tone = 'brand',
}: {
  percent: number
  size?: number
  strokeWidth?: number
  className?: string
  children?: React.ReactNode
  tone?: 'brand' | 'spark'
}) {
  const clamped = Math.max(0, Math.min(100, percent))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const gradientId = tone === 'spark' ? 'ring-spark' : 'ring-brand'

  return (
    <div className={cn('relative inline-flex', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            {tone === 'spark' ? (
              <>
                <stop offset="0%" stopColor="#fcd34d" />
                <stop offset="100%" stopColor="#f472b6" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="55%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#f472b6" />
              </>
            )}
          </linearGradient>
        </defs>

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-ink-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}
