import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

const CONTROL =
  'w-full rounded-xl border border-ink-600/80 bg-ink-900/70 px-3.5 py-2.5 text-sm text-ink-50 placeholder:text-ink-400 transition-colors duration-200 focus:border-neon-400/70 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cn(CONTROL, className)} {...rest} />
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cn(CONTROL, 'resize-y leading-relaxed', className)} {...rest} />
}

export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <select className={cn(CONTROL, 'appearance-none pr-9', className)} {...rest}>
      {children}
    </select>
  )
}

interface FieldProps {
  label: string
  htmlFor?: string
  hint?: ReactNode
  error?: string | null
  required?: boolean
  className?: string
  children: ReactNode
}

/** Label, control, hint and error in one consistent block. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="text-ink-200 flex items-center gap-1 text-xs font-medium tracking-wide"
      >
        {label}
        {required ? (
          <span className="text-spark-400" aria-hidden>
            *
          </span>
        ) : null}
      </label>

      {children}

      {error ? (
        <p role="alert" className="text-wrong-300 text-xs">
          {error}
        </p>
      ) : hint ? (
        <p className="text-ink-400 text-xs">{hint}</p>
      ) : null}
    </div>
  )
}

/** Radio-style tile used to pick a difficulty, visibility or role. */
export function ChoiceTile({
  selected,
  title,
  description,
  onSelect,
  name,
  value,
  tone = 'neon',
}: {
  selected: boolean
  title: string
  description?: string
  onSelect: () => void
  name: string
  value: string
  tone?: 'neon' | 'spark'
}) {
  const activeRing =
    tone === 'spark' ? 'border-spark-400/70 bg-spark-400/10' : 'border-neon-400/70 bg-neon-400/10'

  return (
    <label
      className={cn(
        'flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors duration-200',
        selected ? activeRing : 'border-ink-600/80 bg-ink-900/50 hover:border-ink-500',
      )}
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name={name}
          value={value}
          checked={selected}
          onChange={onSelect}
          className="accent-neon-400 size-3.5"
        />
        <span className="text-ink-50 text-sm font-medium">{title}</span>
      </span>
      {description ? <span className="text-ink-400 pl-5 text-xs">{description}</span> : null}
    </label>
  )
}

/** Accessible on/off switch for quiz options like shuffling. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description?: string
  id: string
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col">
        <label htmlFor={id} className="text-ink-100 text-sm font-medium">
          {label}
        </label>
        {description ? <span className="text-ink-400 text-xs">{description}</span> : null}
      </div>

      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors duration-200',
          checked ? 'border-neon-400/60 bg-neon-500/40' : 'border-ink-600 bg-ink-800',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4.5 rounded-full bg-white transition-all duration-200',
            checked ? 'left-[1.4rem]' : 'left-0.5',
          )}
        />
        <span className="sr-only">{label}</span>
      </button>
    </div>
  )
}
