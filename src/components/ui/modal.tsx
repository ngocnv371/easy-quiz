import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import { X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { EASE } from '@/lib/motion'
import { cn } from '@/lib/utils'

export type ModalTone = 'neutral' | 'neon' | 'spark' | 'correct' | 'wrong' | 'violet'

const TONES: Record<ModalTone, string> = {
  neutral: 'border-ink-600 bg-ink-800/70 text-ink-200',
  neon: 'border-neon-400/40 bg-neon-400/10 text-neon-300',
  spark: 'border-spark-400/40 bg-spark-400/10 text-spark-300',
  correct: 'border-correct-400/40 bg-correct-500/10 text-correct-300',
  wrong: 'border-wrong-400/40 bg-wrong-500/10 text-wrong-300',
  violet: 'border-violet-glow-400/40 bg-violet-glow-500/10 text-violet-glow-300',
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** Secondary line under the title — a prompt, a count, a caveat. */
  description?: ReactNode
  icon?: LucideIcon
  tone?: ModalTone
  /** Pinned below the scrolling body, for totals and a dismiss action. */
  footer?: ReactNode
  /** Extra classes for the panel itself. */
  className?: string
  children: ReactNode
}

/**
 * A centred dialog.
 *
 * The bundle carries no dialog library, so this is the small hand-rolled
 * version: a portal onto `document.body`, `Esc` or a backdrop click to dismiss,
 * focus moved into the panel and returned on close, and page scroll locked
 * while it is open. The body is its own scroll region, so a long list can never
 * push the header or footer off screen.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  tone = 'neutral',
  footer,
  className,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    panelRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 print:hidden sm:items-center">
          <motion.div
            aria-hidden
            className="bg-ink-950/80 absolute inset-0 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            tabIndex={-1}
            initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.24, ease: EASE }}
            className={cn(
              'glass-panel shadow-panel relative flex max-h-[min(85dvh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl outline-none',
              className,
            )}
          >
            <header className="border-ink-600/60 flex items-start gap-3 border-b px-5 py-4 sm:px-6">
              {Icon ? (
                <span
                  className={cn(
                    'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border',
                    TONES[tone],
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
              ) : null}

              <div className="min-w-0 flex-1">
                <h2 className="font-display text-ink-50 text-base font-semibold">{title}</h2>
                {description ? (
                  <p className="text-ink-400 mt-1 text-sm leading-snug">{description}</p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng"
                className="text-ink-400 hover:bg-ink-800 hover:text-ink-100 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full transition-colors"
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3">
              {children}
            </div>

            {footer ? (
              <div className="border-ink-600/60 text-ink-400 border-t px-5 py-3 text-xs sm:px-6">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
