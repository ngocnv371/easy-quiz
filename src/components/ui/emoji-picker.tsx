import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

/** A small, curated emoji chooser — used for quiz covers and player avatars. */
export function EmojiPicker({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string
  onChange: (emoji: string) => void
  options: readonly string[]
  label: string
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-ink-200 mb-2 text-xs font-medium tracking-wide">{label}</p>

      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label={label}
      >
        {options.map((emoji) => (
          <button
            key={emoji}
            type="button"
            role="radio"
            aria-checked={value === emoji}
            aria-label={emoji}
            onClick={() => onChange(emoji)}
            className={cn(
              'relative flex size-10 items-center justify-center rounded-xl border text-lg transition-colors duration-200',
              value === emoji
                ? 'border-neon-400/70 bg-neon-400/15'
                : 'border-ink-600 bg-ink-800/60 hover:border-ink-500',
            )}
          >
            {emoji}

            {value === emoji ? (
              <Check
                className="text-neon-300 bg-ink-900 absolute -top-1.5 -right-1.5 size-3.5 rounded-full"
                aria-hidden
              />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}
