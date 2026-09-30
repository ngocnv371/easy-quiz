import { Check, X } from 'lucide-react'

import { cn } from '@/lib/utils'

export type AnswerState = 'idle' | 'selected' | 'correct' | 'wrong' | 'dim'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export function optionLetter(index: number): string {
  return LETTERS[index] ?? String(index + 1)
}

/**
 * One answer choice, shared by the player and the result review.
 *
 * `data-state` drives the styling (see the `.answer-tile` rules in globals.css)
 * so the correct/wrong treatment is identical in both places.
 */
export function AnswerTile({
  letter,
  label,
  state,
  disabled,
  onClick,
  className,
}: {
  letter: string
  label: string
  state: AnswerState
  disabled?: boolean
  onClick?: () => void
  className?: string
}) {
  const dataState = state === 'idle' || state === 'selected' ? undefined : state

  return (
    <button
      type="button"
      className={cn(
        'answer-tile flex items-center gap-4 px-4 py-3.5',
        state === 'selected' &&
          'border-neon-400/70 bg-neon-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.35),0_0_26px_-8px_rgba(34,211,238,0.7)]',
        className,
      )}
      data-state={dataState}
      aria-pressed={state === 'selected'}
      disabled={disabled}
      onClick={onClick}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold transition-colors',
          state === 'correct'
            ? 'bg-correct-400 text-ink-950'
            : state === 'wrong'
              ? 'bg-wrong-400 text-ink-950'
              : state === 'selected'
                ? 'bg-neon-400 text-ink-950'
                : 'bg-ink-700 text-ink-200',
        )}
        aria-hidden
      >
        {state === 'correct' ? (
          <Check className="size-4" />
        ) : state === 'wrong' ? (
          <X className="size-4" />
        ) : (
          letter
        )}
      </span>

      <span className="text-ink-100 flex-1 text-left text-sm leading-relaxed sm:text-base">
        {label}
      </span>
    </button>
  )
}
