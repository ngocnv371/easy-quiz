import { Toaster } from 'sonner'

/**
 * App-wide toast outlet.
 *
 * `theme="dark"` is load-bearing, not decorative. Sonner ships a light default
 * and injects its stylesheet after Tailwind's, so its white card wins over any
 * background class and leaves our pale text unreadable. The theme fixes the
 * fallback; the `!`-prefixed classes below then put the card on the design
 * system explicitly, rather than relying on which stylesheet loaded last.
 *
 * The toast background is set on every variant on purpose: a success or warning
 * toast should still read as an Easy Quiz surface, with the variant showing
 * through the border colour.
 */
export function AppToaster() {
  return (
    <Toaster
      theme="dark"
      position="top-center"
      closeButton
      duration={4000}
      toastOptions={{
        classNames: {
          toast:
            'backdrop-blur-md !rounded-xl !border !border-ink-600/70 !bg-ink-900/95 !text-ink-100 !shadow-panel',
          title: '!text-ink-50 !font-medium',
          description: '!text-ink-300',
          actionButton: '!bg-neon-400 !text-ink-950 !font-medium',
          cancelButton: '!bg-ink-700 !text-ink-200',
          closeButton: '!bg-ink-800 !border-ink-600 !text-ink-300 hover:!text-ink-50',
          success: '!border-correct-400/50',
          error: '!border-wrong-400/50',
          warning: '!border-spark-400/50',
          info: '!border-neon-400/50',
        },
      }}
    />
  )
}
