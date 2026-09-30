import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-lg bg-ink-800/70',
        'after:absolute after:inset-0 after:animate-[sheen_2.4s_ease-in-out_infinite] after:bg-gradient-to-r after:from-transparent after:via-ink-600/40 after:to-transparent',
        className,
      )}
    />
  )
}

export function QuizCardSkeleton() {
  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="mt-4 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </div>
  )
}

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink-600/70 bg-ink-900/40 px-6 py-14 text-center',
        className,
      )}
    >
      {Icon ? (
        <span className="flex size-12 items-center justify-center rounded-2xl border border-ink-600/70 bg-ink-800/60">
          <Icon className="text-neon-400 size-5" aria-hidden />
        </span>
      ) : null}

      <h3 className="font-display text-ink-50 text-base font-semibold">{title}</h3>

      {description ? (
        <p className="text-ink-300 max-w-md text-sm leading-relaxed">{description}</p>
      ) : null}

      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

/** A quiet inline notice for errors, warnings and setup hints. */
export function Alert({
  tone = 'info',
  title,
  children,
  icon: Icon,
  className,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success'
  title?: string
  children?: ReactNode
  icon?: LucideIcon
  className?: string
}) {
  const tones = {
    info: 'border-neon-400/40 bg-neon-400/8 text-ink-100',
    warning: 'border-spark-400/40 bg-spark-400/8 text-ink-100',
    error: 'border-wrong-400/40 bg-wrong-500/8 text-ink-100',
    success: 'border-correct-400/40 bg-correct-500/8 text-ink-100',
  } as const

  const iconTones = {
    info: 'text-neon-400',
    warning: 'text-spark-400',
    error: 'text-wrong-400',
    success: 'text-correct-400',
  } as const

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-xl border p-4 text-sm', tones[tone], className)}
    >
      {Icon ? <Icon className={cn('mt-0.5 size-4 shrink-0', iconTones[tone])} aria-hidden /> : null}
      <div className="space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-ink-300 leading-relaxed">{children}</div> : null}
      </div>
    </div>
  )
}
