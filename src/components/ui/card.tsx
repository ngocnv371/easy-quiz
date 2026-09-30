import type { ComponentProps, HTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'

export function Card({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'glass-panel shadow-panel relative overflow-hidden rounded-2xl',
        className,
      )}
      {...rest}
    />
  )
}

export function CardHeader({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 p-5 sm:p-6', className)} {...rest} />
}

export function CardTitle({ className, ...rest }: ComponentProps<'h3'>) {
  return (
    <h3
      className={cn('font-display text-ink-50 text-lg font-semibold tracking-tight', className)}
      {...rest}
    />
  )
}

export function CardDescription({ className, ...rest }: ComponentProps<'p'>) {
  return <p className={cn('text-ink-300 text-sm leading-relaxed', className)} {...rest} />
}

export function CardContent({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('px-5 pb-5 sm:px-6 sm:pb-6', className)} {...rest} />
}

export function CardFooter({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('border-t border-ink-600/60 px-5 py-4 sm:px-6', className)}
      {...rest}
    />
  )
}

/**
 * A card that behaves as a link. Used across the quiz catalogue so an entire
 * tile is clickable while the accessible name stays the quiz title.
 */
export function CardLink({
  to,
  className,
  children,
  ...rest
}: Omit<ComponentProps<typeof Link>, 'className'> & {
  className?: string
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      className={cn(
        'glass-panel shadow-panel hairline-gradient group relative block overflow-hidden rounded-2xl transition-transform duration-300 hover:-translate-y-1',
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  )
}

/** A single number with a label — used for score, rank and streak readouts. */
export function Stat({
  label,
  value,
  hint,
  className,
  ...rest
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  className?: string
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-col gap-1', className)} {...rest}>
      <span className="text-ink-400 text-[0.7rem] font-medium uppercase tracking-[0.16em]">
        {label}
      </span>
      <span className="font-display text-ink-50 text-2xl font-semibold tabular-nums">
        {value}
      </span>
      {hint ? <span className="text-ink-400 text-xs">{hint}</span> : null}
    </div>
  )
}
