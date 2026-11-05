import { useEffect, useRef, useState } from 'react'
import { ArrowRight, BadgeCheck, LineChart, Rocket, Sparkles, Trophy, UserPlus, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/features/auth/auth-context'
import { BRAND_URL } from '@/lib/site'
import { cn } from '@/lib/utils'

import { ADSENSE_CLIENT, ADSENSE_SLOT, adsenseConfigured, loadAdsense } from './adsense'

/** How long the continue button waits. */
const HOLD_SECONDS = 5

/**
 * How long AdSense gets to fill the unit before the house ad takes its place.
 * Until the site is approved (and whenever Google has nothing to serve) the
 * unit stays empty: marked `data-ad-status="unfilled"`, or never marked at all.
 */
const FILL_WAIT_MS = 3000

/**
 * The ad break, played when the player carries on from a summary.
 *
 * A full-screen stage rather than a dialog: it carries its own heading and a
 * way on, the ad is one clearly labelled unit inside it, and nothing is placed
 * to be clicked by accident. Continue unlocks after a few seconds. The unit is
 * AdSense's when it fills; otherwise (not configured, blocked, not approved
 * yet, nothing to serve) it is one of our own house ads.
 *
 * Every link here opens a new tab, so following one never ends the run.
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
    const fallBack = () => {
      if (alive) setHouseAd(true)
    }

    const slot = slotRef.current
    // AdSense says how it went on the unit itself; "unfilled" means no ad is coming.
    const observer = new MutationObserver(() => {
      if (slot?.dataset.adStatus === 'unfilled') fallBack()
    })
    if (slot) observer.observe(slot, { attributes: true, attributeFilter: ['data-ad-status'] })
    const timer = window.setTimeout(() => {
      if (slot?.dataset.adStatus !== 'filled') fallBack()
    }, FILL_WAIT_MS)

    loadAdsense()
      .then(() => {
        if (!alive || !slot || slot.dataset.adsbygoogleStatus) return
        ;(window.adsbygoogle = window.adsbygoogle ?? []).push({})
      })
      .catch(fallBack)

    return () => {
      alive = false
      observer.disconnect()
      window.clearTimeout(timer)
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
          <a
            href="/no-ads"
            target="_blank"
            rel="noopener"
            className="text-ink-300 hover:text-ink-50 inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
            data-cy="ad-break-remove"
          >
            <BadgeCheck className="size-4" aria-hidden />
            Gỡ quảng cáo vĩnh viễn
          </a>
          <Button ref={continueRef} disabled={left > 0} onClick={onContinue} data-cy="ad-break-continue">
            {left > 0 ? `${continueLabel} sau ${left}s` : continueLabel}
            {left > 0 ? null : <ArrowRight className="size-4" aria-hidden />}
          </Button>
        </div>
      </Card>
    </div>
  )
}

interface HouseAdCopy {
  key: string
  icon: LucideIcon
  tone: string
  title: string
  body: string
  cta: string
  href: string
  /** Only for a guest: an account would be pointless to someone who has one. */
  guestOnly?: boolean
}

// Our own ads: the ad-free pass, and the parts of the site (and of AiTechX) worth a visit.
const HOUSE_ADS: HouseAdCopy[] = [
  {
    key: 'ad-free',
    icon: Sparkles,
    tone: 'border-violet-glow-400/40 bg-violet-glow-500/10 text-violet-glow-300',
    title: 'Học không bị làm phiền',
    body: 'Trả một lần để không bao giờ phải chờ quảng cáo nữa.',
    cta: 'Xem chi tiết',
    href: '/no-ads',
  },
  {
    key: 'account',
    icon: UserPlus,
    tone: 'border-neon-400/40 bg-neon-400/10 text-neon-300',
    title: 'Giữ lại thành tích của bạn',
    body: 'Tạo tài khoản miễn phí để giữ chuỗi đúng, điểm theo chủ đề và luyện tiếp trên thiết bị khác.',
    cta: 'Tạo tài khoản',
    href: '/register',
    guestOnly: true,
  },
  {
    key: 'topic-boards',
    icon: Trophy,
    tone: 'border-spark-400/40 bg-spark-400/10 text-spark-300',
    title: 'Bạn đứng thứ mấy?',
    body: 'Mỗi câu đúng đều được tính vào bảng xếp hạng theo từng chủ đề.',
    cta: 'Xem bảng xếp hạng',
    href: '/leaderboard?board=topics',
  },
  {
    key: 'progress',
    icon: LineChart,
    tone: 'border-correct-400/40 bg-correct-500/10 text-correct-300',
    title: 'Chủ đề nào còn yếu?',
    body: 'Trang tiến độ chỉ ra những chủ đề bạn nên luyện thêm, chỉ một chạm là vào luyện.',
    cta: 'Xem tiến độ',
    href: '/progress',
  },
  {
    key: 'aitechx',
    icon: Rocket,
    tone: 'border-magenta-400/40 bg-magenta-500/10 text-magenta-400',
    title: 'Thêm từ AiTechX',
    body: 'Khám phá các ứng dụng và trò chơi khác do đội ngũ Easy Quiz làm ra.',
    cta: 'Ghé AiTechX',
    href: BRAND_URL,
  },
]

/** The ad-free pass gets this share of breaks; the rest rotate evenly. */
const AD_FREE_SHARE = 0.4

function pickHouseAd(isGuest: boolean): HouseAdCopy {
  const [adFree, ...rest] = HOUSE_ADS
  if (Math.random() < AD_FREE_SHARE) return adFree!
  const eligible = rest.filter((ad) => isGuest || !ad.guestOnly)
  return eligible[Math.floor(Math.random() * eligible.length)] ?? adFree!
}

function HouseAd() {
  const { isGuest } = useAuth()
  // Chosen once per break, so the ad doesn't change under the player.
  const [ad] = useState(() => pickHouseAd(isGuest))
  const Icon = ad.icon

  return (
    <div className="px-6 py-8 text-center" data-cy="house-ad" data-ad={ad.key}>
      <span className={cn('mx-auto flex size-12 items-center justify-center rounded-2xl border', ad.tone)}>
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="font-display text-ink-50 mt-4 text-lg font-semibold">{ad.title}</p>
      <p className="text-ink-300 mx-auto mt-1.5 max-w-xs text-sm">{ad.body}</p>
      <a
        href={ad.href}
        target="_blank"
        rel="noopener"
        className="text-violet-glow-300 hover:text-violet-glow-200 mt-4 inline-block text-sm font-medium"
      >
        {ad.cta} →
      </a>
    </div>
  )
}
