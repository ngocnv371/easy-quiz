import { useState, type ReactNode } from 'react'
import { BadgeCheck, CheckCircle2, Gift, Sparkles, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/feedback'
import { useAuth } from '@/features/auth/auth-context'
import { fetchStoreProducts, startCheckout, type StoreProduct } from '@/features/ads/api'
import { formatVnd } from '@/features/ads/format'
import { usePageMeta } from '@/lib/seo'
import { useAsyncData } from '@/lib/use-async-data'
import { errorMessage } from '@/lib/utils'

/**
 * The shop, which sells one thing: the ad-free pass. Playing is free and
 * unlimited; this page explains the ad break and removes it for good. Buying
 * needs a real account, so a guest is asked to sign up first.
 */
export function NoAdsPage() {
  const { user, isGuest, profile } = useAuth()
  const [buying, setBuying] = useState(false)

  usePageMeta({
    title: 'Gỡ quảng cáo vĩnh viễn',
    description:
      'Easy Quiz miễn phí và không giới hạn. Trả một lần để không bao giờ thấy quảng cáo sau mỗi lượt luyện tập.',
    path: '/no-ads',
  })

  const products = useAsyncData('store:products', fetchStoreProducts)
  const product = products.data?.find((item) => item.kind === 'ad_free') ?? null

  const buy = async (item: StoreProduct) => {
    setBuying(true)
    try {
      const { checkout_url } = await startCheckout(item.id)
      window.location.assign(checkout_url)
    } catch (error) {
      toast.error(errorMessage(error))
      setBuying(false)
    }
  }

  const adFree = Boolean(profile?.ad_free)
  const canBuy = !!user && !isGuest && !adFree

  return (
    <div className="relative">
      <AuroraBackground />

      <div className="container-page relative py-14">
        <div className="max-w-2xl">
          <Badge tone="violet" icon={Sparkles}>
            Không quảng cáo
          </Badge>
          <h1 className="font-display mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
            Luyện tập miễn phí, <span className="text-gradient">không giới hạn</span>
          </h1>
          <p className="text-ink-300 mt-3 text-base leading-relaxed">
            Mọi đề thi và chế độ vô tận đều miễn phí. Sau mỗi lượt luyện tập có một quảng cáo
            ngắn — trả một lần để gỡ nó vĩnh viễn.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          {/* ── The pass ──────────────────────────────────────────────── */}
          <Card className="border-violet-glow-400/60 flex flex-col p-6 shadow-[0_0_40px_-12px] shadow-violet-500/40 sm:p-7" data-cy="product-ad_free">
            {products.loading ? (
              <div className="space-y-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-11 w-full" />
              </div>
            ) : adFree ? (
              <div data-cy="ad-free-active">
                <span className="border-correct-400/40 bg-correct-500/10 text-correct-300 flex size-11 items-center justify-center rounded-2xl border">
                  <BadgeCheck className="size-5" aria-hidden />
                </span>
                <p className="font-display text-ink-50 mt-5 text-lg font-semibold">Bạn đã gỡ quảng cáo</p>
                <p className="text-ink-300 mt-1.5 text-sm">
                  Tài khoản này sẽ không bao giờ thấy quảng cáo nữa. Cảm ơn bạn đã ủng hộ Easy Quiz!
                </p>
                <ButtonLink to="/endless" className="mt-6">
                  Luyện tập ngay
                </ButtonLink>
              </div>
            ) : product ? (
              <>
                <span className="border-violet-glow-400/40 bg-violet-glow-500/10 text-violet-glow-300 flex size-11 items-center justify-center rounded-2xl border">
                  <BadgeCheck className="size-5" aria-hidden />
                </span>
                <h2 className="font-display text-ink-50 mt-5 text-lg font-semibold">{product.name}</h2>
                {product.description ? <p className="text-ink-300 mt-1.5 text-sm">{product.description}</p> : null}
                <p className="font-display text-ink-50 mt-5 text-3xl font-semibold tabular-nums">
                  {formatVnd(product.price_vnd)}
                  <span className="text-ink-400 text-sm font-normal"> · một lần</span>
                </p>
                <div className="mt-6">
                  {canBuy ? (
                    <Button className="w-full" loading={buying} onClick={() => void buy(product)} data-cy="buy-ad-free">
                      {buying ? null : <BadgeCheck className="size-4" aria-hidden />}
                      Gỡ quảng cáo
                    </Button>
                  ) : (
                    <ButtonLink to={user ? '/register' : '/login?redirect=%2Fno-ads'} variant="outline" className="w-full">
                      {user ? 'Tạo tài khoản để mua' : 'Đăng nhập để mua'}
                    </ButtonLink>
                  )}
                </div>
                <p className="text-ink-400 mt-3 text-xs">
                  Thanh toán qua mã VietQR bằng app ngân hàng hoặc ví điện tử, xử lý bởi PayOS.
                </p>
              </>
            ) : (
              <p className="text-ink-300 text-sm">Gói này tạm thời chưa mở bán.</p>
            )}
          </Card>

          <Card className="p-6 sm:p-7">
            <h2 className="text-ink-50 text-sm font-semibold">Hoạt động thế nào?</h2>
            <ul className="text-ink-300 mt-4 space-y-3 text-sm">
              <HowItem>Làm bao nhiêu đề, luyện bao nhiêu câu cũng được — không giới hạn.</HowItem>
              <HowItem>Mỗi khi nộp bài hoặc dừng chế độ vô tận, bạn xem một quảng cáo vài giây.</HowItem>
              <HowItem>Không có quảng cáo trong lúc đang làm bài.</HowItem>
              <HowItem>
                Gỡ quảng cáo là trả <strong className="text-ink-100">một lần</strong>, dùng mãi mãi trên
                tài khoản của bạn — không gia hạn, không phí ẩn.
              </HowItem>
            </ul>
          </Card>
        </div>

        {user && isGuest ? (
          <Card className="border-neon-400/40 mt-6 flex flex-wrap items-center gap-4 p-5">
            <Gift className="text-neon-300 size-6 shrink-0" aria-hidden />
            <p className="text-ink-200 min-w-0 flex-1 text-sm">
              Bạn đang chơi với tư cách khách. Tạo tài khoản miễn phí để giữ lại tiến độ và mở khoá
              gỡ quảng cáo — gói đã mua luôn gắn với tài khoản của bạn.
            </p>
            <ButtonLink to="/register" size="sm">
              <UserPlus className="size-4" aria-hidden />
              Tạo tài khoản
            </ButtonLink>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function HowItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <CheckCircle2 className="text-correct-400 mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </li>
  )
}
