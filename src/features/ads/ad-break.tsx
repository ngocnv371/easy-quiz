import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BadgeCheck, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { ADSENSE_CLIENT, ADSENSE_SLOT, adsenseConfigured, loadAdsense } from './adsense'

/** How long the continue button waits. */
const HOLD_SECONDS = 5

/**
 * The ad break between a finished session and its results.
 *
 * A full-screen stage rather than a dialog: it carries its own heading and a
 * way on, the ad is one clearly labelled unit inside it, and nothing is placed
 * to be clicked by accident. Continue unlocks after a few seconds. Without
 * AdSense configured, or with it blocked, the unit is a house ad for the
 * ad-free pass.
 */
export function AdBreak({ continueLabel, onContinue }: { continueLabel: string; onContinue: () => void }) {
  const [left, setLeft] = useState(HOLD_SECONDS)
  const [houseAd, setHouseAd] = useState(!adsenseConfigured)
  const slotRef = useRef<HTMLModElement>(null)
  const continueRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [])

  // Hand focus to continue once it is usable, so a keyboard player can move on.
  useEffect(() => {
    if (left === 0) continueRef.current?.focus()
  }, [left])

  useEffect(() => {
    if (!adsenseConfigured) return
    let alive = true
    loadAdsense()
      .then(() => {
        if (!alive || !slotRef.current || slotRef.current.dataset.adsbygoogleStatus) return
        ;(window.adsbygoogle = window.adsbygoogle ?? []).push({})
      })
      .catch(() => {
        if (alive) setHouseAd(true)
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div
      className="bg-ink-950/95 fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 backdrop-blur sm:p-5"
      data-cy="ad-break"
    >
      <Card className="animate-pop my-auto w-full max-w-xl p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-ink-50 font-display text-base font-semibold">Hoàn thành!</p>
          <p className="text-ink-400 text-xs tracking-[0.14em] uppercase">Quảng cáo</p>
        </div>

        <div className="border-ink-600/60 bg-ink-900/60 mt-4 flex min-h-[250px] items-center justify-center overflow-hidden rounded-xl border">
          {houseAd ? (
            <HouseAd />
          ) : (
            <ins
              ref={slotRef}
              className="adsbygoogle block w-full"
              style={{ display: 'block', minHeight: 250 }}
              data-ad-client={ADSENSE_CLIENT}
              data-ad-slot={ADSENSE_SLOT}
              data-ad-format="auto"
              data-full-width-responsive="true"
            />
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/no-ads"
            className="text-ink-300 hover:text-ink-50 inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
            data-cy="ad-break-remove"
          >
            <BadgeCheck className="size-4" aria-hidden />
            Gỡ quảng cáo vĩnh viễn
          </Link>
          <Button ref={continueRef} disabled={left > 0} onClick={onContinue} data-cy="ad-break-continue">
            {left > 0 ? `${continueLabel} sau ${left}s` : continueLabel}
            {left > 0 ? null : <ArrowRight className="size-4" aria-hidden />}
          </Button>
        </div>
      </Card>
    </div>
  )
}

function HouseAd() {
  return (
    <div className="px-6 py-8 text-center" data-cy="house-ad">
      <span className="border-violet-glow-400/40 bg-violet-glow-500/10 text-violet-glow-300 mx-auto flex size-12 items-center justify-center rounded-2xl border">
        <Sparkles className="size-6" aria-hidden />
      </span>
      <p className="font-display text-ink-50 mt-4 text-lg font-semibold">Học không bị làm phiền</p>
      <p className="text-ink-300 mx-auto mt-1.5 max-w-xs text-sm">
        Trả một lần để không bao giờ phải chờ quảng cáo sau mỗi lượt luyện tập nữa.
      </p>
      <Link to="/no-ads" className="text-violet-glow-300 hover:text-violet-glow-200 mt-4 inline-block text-sm font-medium">
        Xem chi tiết →
      </Link>
    </div>
  )
}
