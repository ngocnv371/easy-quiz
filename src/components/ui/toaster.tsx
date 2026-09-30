import { Toaster } from 'sonner'

/**
 * App-wide toast outlet. Tuned to the Easy Quiz palette so a notification
 * reads as part of the product rather than a generic library default.
 */
export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      closeButton
      duration={4000}
      toastOptions={{
        classNames: {
          toast:
            'glass-panel !rounded-xl !border-ink-600/70 !text-ink-100 !shadow-panel',
          title: '!text-ink-50 !font-medium',
          description: '!text-ink-300',
          actionButton: '!bg-neon-400 !text-ink-950',
          cancelButton: '!bg-ink-700 !text-ink-200',
          success: '!border-correct-400/40',
          error: '!border-wrong-400/40',
          warning: '!border-spark-400/40',
        },
      }}
    />
  )
}
