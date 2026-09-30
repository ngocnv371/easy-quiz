import { cn } from '@/lib/utils'

/**
 * Ambient background: grid, drifting colour orbs and a grain layer — the same
 * treatment the AiTechX marketing site uses, so a product page feels like it
 * belongs to the family.
 */
export function AuroraBackground({
  className,
  grid = true,
  variant = 'brand',
}: {
  className?: string
  grid?: boolean
  /** `brand` is the cool site palette; `quiz` adds the warm spark orb. */
  variant?: 'brand' | 'quiz'
}) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      {grid ? (
        <div className="grid-backdrop absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_72%)]" />
      ) : null}

      <div className="bg-neon-500/20 animate-float-slow absolute -top-52 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full blur-[130px]" />
      <div className="bg-violet-glow-600/25 animate-float absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full blur-[130px]" />
      <div className="bg-magenta-500/12 animate-float-slow absolute top-1/3 -right-28 h-[26rem] w-[26rem] rounded-full blur-[130px]" />

      {variant === 'quiz' ? (
        <div className="bg-spark-400/12 animate-float absolute top-24 left-1/4 h-[18rem] w-[18rem] rounded-full blur-[120px]" />
      ) : null}

      <div className="noise-overlay absolute inset-0 opacity-[0.035] mix-blend-soft-light" />
      <div className="from-ink-950 absolute inset-x-0 top-0 h-40 bg-gradient-to-b to-transparent" />
      <div className="from-ink-950 absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t to-transparent" />
    </div>
  )
}
