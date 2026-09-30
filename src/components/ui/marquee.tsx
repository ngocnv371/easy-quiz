import { cn } from '@/lib/utils'

/**
 * An infinite horizontal scroller. The children are rendered twice so the
 * `-50%` translate in the `marquee` keyframe loops seamlessly.
 */
export function Marquee({
  children,
  className,
  reverse = false,
  pauseOnHover = true,
}: {
  children: React.ReactNode
  className?: string
  reverse?: boolean
  pauseOnHover?: boolean
}) {
  return (
    <div
      className={cn(
        'group relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]',
        className,
      )}
    >
      <div
        className={cn(
          'animate-marquee flex w-max shrink-0 items-center gap-3',
          reverse && '[animation-direction:reverse]',
          pauseOnHover && 'group-hover:[animation-play-state:paused]',
        )}
      >
        <div className="flex items-center gap-3 pr-3">{children}</div>
        <div className="flex items-center gap-3 pr-3" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  )
}
