import type { ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'spark'

export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const BASE =
  'group relative inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold tracking-tight transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-neon-400 via-neon-300 to-violet-glow-400 text-ink-950 shadow-[0_10px_40px_-12px_rgba(34,211,238,0.75)] hover:shadow-[0_16px_50px_-10px_rgba(139,92,246,0.85)] hover:brightness-110',
  spark:
    'bg-gradient-to-r from-spark-300 via-spark-400 to-magenta-400 text-ink-950 shadow-[0_10px_40px_-12px_rgba(251,191,36,0.8)] hover:brightness-110',
  secondary: 'glass-panel text-ink-50 hover:border-neon-400/60 hover:text-white',
  outline:
    'border border-ink-600 text-ink-100 hover:border-neon-400/70 hover:bg-neon-400/5 hover:text-white',
  ghost: 'text-ink-200 hover:bg-ink-800/70 hover:text-white',
  danger:
    'border border-wrong-400/50 bg-wrong-500/10 text-wrong-300 hover:border-wrong-400 hover:bg-wrong-500/20 hover:text-wrong-200',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3.5 text-base',
  icon: 'size-10 p-0',
}

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
) {
  return cn(BASE, VARIANTS[variant], SIZES[size], className)
}

interface ButtonProps extends Omit<ComponentProps<'button'>, 'className'> {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  /** Swaps the label for a spinner and blocks further clicks. */
  loading?: boolean
  children?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  loading = false,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  )
}

interface ButtonLinkProps extends Omit<ComponentProps<typeof Link>, 'className'> {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  children: ReactNode
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </Link>
  )
}

interface ButtonAnchorProps extends Omit<ComponentProps<'a'>, 'className'> {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  children: ReactNode
}

export function ButtonAnchor({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonAnchorProps) {
  return (
    <a className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </a>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
