import { Link } from 'react-router-dom'
import { Crown, Zap } from 'lucide-react'

import { cn } from '@/lib/utils'

import { useEnergy } from './energy-context'

/**
 * The header pill: remaining energy, or the Plus crown while unlimited.
 * Links to the shop, which also explains how energy works.
 */
export function EnergyMeter({ className, dataCy = 'energy-meter' }: { className?: string; dataCy?: string }) {
  const { energy } = useEnergy()
  if (!energy) return null

  const low = !energy.unlimited && energy.total <= 5

  return (
    <Link
      to="/energy"
      data-cy={dataCy}
      title={
        energy.unlimited
          ? 'Easy Quiz Plus: luyện không giới hạn'
          : `${energy.free} năng lượng miễn phí hôm nay · ${energy.paid} đã nạp`
      }
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors',
        energy.unlimited
          ? 'border-violet-glow-400/50 bg-violet-glow-500/10 text-violet-glow-300 hover:border-violet-glow-400'
          : low
            ? 'border-wrong-400/50 bg-wrong-500/10 text-wrong-300 hover:border-wrong-400'
            : 'border-spark-400/40 bg-spark-400/10 text-spark-300 hover:border-spark-400/70',
        className,
      )}
    >
      {energy.unlimited ? (
        <>
          <Crown className="size-3.5" aria-hidden />
          Plus
        </>
      ) : (
        <>
          <Zap className="size-3.5" aria-hidden />
          <span key={energy.total} className="animate-pop inline-block">
            {energy.total}
          </span>
          <span className="sr-only">năng lượng</span>
        </>
      )}
    </Link>
  )
}
