import { Check, X } from 'lucide-react'

import { cn } from '@/lib/utils'

const SIDES = [
  { value: true, label: 'Đúng' },
  { value: false, label: 'Sai' },
] as const

const truthLabel = (value: boolean) => (value ? 'Đúng' : 'Sai')

/**
 * A Đúng/Sai segmented switch: one track, one thumb that slides to the picked
 * side. With nothing picked there is no thumb, so "not answered yet" shows.
 *
 * `thumbClassName` colours the thumb — the caller knows whether it means
 * "selected" (player), "this is the truth" (author) or "right/wrong" (review).
 */
export function TruthSwitch({
  value,
  onChange,
  label,
  thumbClassName = 'bg-neon-400 shadow-[0_0_18px_-6px_rgba(34,211,238,0.9)]',
  disabled,
  size = 'md',
}: {
  value: boolean | undefined
  onChange?: (value: boolean) => void
  label: string
  thumbClassName?: string
  disabled?: boolean
  size?: 'sm' | 'md'
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'border-ink-600 bg-ink-950/70 relative grid shrink-0 grid-cols-2 rounded-full border p-1',
        size === 'sm' ? 'w-28' : 'w-36',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full transition-[translate,opacity,background-color] duration-200 ease-out',
          value === false && 'translate-x-full',
          value === undefined && 'opacity-0',
          thumbClassName,
        )}
      />
      {SIDES.map((side) => (
        <button
          key={side.label}
          type="button"
          role="radio"
          aria-checked={value === side.value}
          disabled={disabled}
          onClick={() => onChange?.(side.value)}
          className={cn(
            'relative z-10 rounded-full font-semibold transition-colors',
            size === 'sm' ? 'py-1 text-xs' : 'py-1.5 text-sm',
            value === side.value ? 'text-ink-950' : 'text-ink-400 enabled:hover:text-ink-100',
            disabled && 'cursor-default',
          )}
        >
          {side.label}
        </button>
      ))}
    </div>
  )
}

/**
 * One true/false statement with its switch, shared by the player and the
 * result review.
 *
 * With `truth` set (the review) the switch is read-only and the thumb sits on
 * what the player marked: green when that was right, red when not, in which
 * case the right answer is spelled out under the statement.
 */
export function TrueFalseStatement({
  letter,
  label,
  value,
  onChange,
  truth,
  disabled,
}: {
  letter: string
  label: string
  value: boolean | undefined
  onChange?: (value: boolean) => void
  /** The statement's real truth — only passed once graded. */
  truth?: boolean
  disabled?: boolean
}) {
  const graded = truth !== undefined
  const rowState = !graded ? undefined : value === truth ? 'correct' : value === undefined ? 'dim' : 'wrong'

  return (
    <div
      className="answer-tile flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:flex-nowrap"
      data-state={rowState}
    >
      <span
        className="bg-ink-700 text-ink-200 flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
        aria-hidden
      >
        {letter}
      </span>

      <div className="min-w-0 flex-1 text-left">
        <p className="text-ink-100 text-sm leading-relaxed sm:text-base">{label}</p>
        {graded && value !== truth ? (
          <p className="text-correct-300 mt-1 inline-flex items-center gap-1 text-xs font-medium">
            {value === undefined ? (
              <X className="text-spark-300 size-3.5" aria-hidden />
            ) : (
              <Check className="size-3.5" aria-hidden />
            )}
            {value === undefined ? 'Bỏ trống · ' : ''}Đáp án: {truthLabel(truth)}
          </p>
        ) : null}
      </div>

      <TruthSwitch
        value={value}
        onChange={onChange}
        label={`Mệnh đề ${letter}`}
        disabled={disabled || graded}
        thumbClassName={
          graded ? (value === truth ? 'bg-correct-400' : 'bg-wrong-400') : undefined
        }
      />
    </div>
  )
}

/**
 * The short-answer box: one or two words, or a number. Enter hands over to
 * `onEnter` (next question / submit), since the page's own shortcuts ignore
 * keys typed into a field.
 */
export function ShortAnswerInput({
  value,
  onChange,
  onEnter,
  disabled,
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  onEnter?: () => void
  disabled?: boolean
  autoFocus?: boolean
}) {
  return (
    <div>
      <label htmlFor="short-answer" className="text-ink-200 mb-2 block text-xs font-medium tracking-wide">
        Câu trả lời của bạn
      </label>
      <input
        id="short-answer"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            onEnter?.()
          }
        }}
        disabled={disabled}
        // A fresh question should be ready to type into.
        autoFocus={autoFocus}
        maxLength={200}
        autoComplete="off"
        spellCheck={false}
        placeholder="Nhập một vài từ hoặc một số"
        className="answer-tile text-ink-50 placeholder:text-ink-500 focus:border-neon-400/70 w-full px-4 py-3.5 text-base outline-none focus:shadow-[0_0_0_1px_rgba(34,211,238,0.35),0_0_26px_-8px_rgba(34,211,238,0.7)] sm:text-lg"
      />
      <p className="text-ink-500 mt-2 text-xs">
        Không phân biệt chữ hoa, chữ thường hay dấu (gõ “ha noi” cũng được). Số có thể viết 0,5 ·
        0.5 · 1/2.
      </p>
    </div>
  )
}
