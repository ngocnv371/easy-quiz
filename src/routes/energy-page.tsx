import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { CheckCircle2, Crown, Gift, Sparkles, UserPlus, Zap } from 'lucide-react'
import { toast } from 'sonner'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, Skeleton } from '@/components/ui/feedback'
import { ProgressBar } from '@/components/ui/metrics'
import { useAuth } from '@/features/auth/auth-context'
import { fetchStoreProducts, startCheckout, type StoreProduct } from '@/features/energy/api'
import { useEnergy } from '@/features/energy/energy-context'
import { formatDay, formatTimeUntil, formatVnd } from '@/features/energy/format'
import { usePageMeta } from '@/lib/seo'
import { useAsyncData } from '@/lib/use-async-data'
import { cn, errorMessage } from '@/lib/utils'

/**
 * The shop, and the one place that explains energy: today's balance, when it
 * refills, and what can be bought. Buying needs a real account — a guest is
 * asked to sign up first, which also doubles their free allowance.
 */
export function EnergyPage() {
  const { user, isGuest, isConfigured } = useAuth()
  const { energy, loading } = useEnergy()
  const { hash } = useLocation()
  const [buying, setBuying] = useState<string | null>(null)

  usePageMeta({
    title: 'Năng lượng & Easy Quiz Plus',
    description:
      'Mỗi ngày Easy Quiz tặng năng lượng miễn phí để luyện tập. Nạp thêm hoặc tham gia Easy Quiz Plus để luyện không giới hạn.',
    path: '/energy',
  })

  const products = useAsyncData('store:products', fetchStoreProducts, isConfigured)
  const packs = (products.data ?? []).filter((product) => product.kind === 'energy')
  const plans = (products.data ?? []).filter((product) => product.kind === 'plus')

  // `/energy#plus` (from the out-of-energy dialog) lands on the Plus card.
  useEffect(() => {
    if (hash !== '#plus' || products.loading) return
    document.getElementById('plus')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [hash, products.loading])

  const buy = async (product: StoreProduct) => {
    setBuying(product.id)
    try {
      const { checkout_url } = await startCheckout(product.id)
      window.location.assign(checkout_url)
    } catch (error) {
      toast.error(errorMessage(error))
      setBuying(null)
    }
  }

  const canBuy = !!user && !isGuest

  return (
    <div className="relative">
      <AuroraBackground />

      <div className="container-page relative py-14">
        <div className="max-w-2xl">
          <Badge tone="spark" icon={Zap}>
            Năng lượng
          </Badge>
          <h1 className="font-display mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
            Mỗi câu trả lời, <span className="text-gradient">một tia năng lượng</span>
          </h1>
          <p className="text-ink-300 mt-3 text-base leading-relaxed">
            Easy Quiz tặng bạn năng lượng miễn phí mỗi ngày để luyện tập. Hết thì nghỉ ngơi đến
            mai, hoặc nạp thêm để học tiếp ngay.
          </p>
        </div>

        {/* ── Balance ─────────────────────────────────────────────────── */}
        <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <Card className="p-6 sm:p-7" data-cy="energy-balance">
            {!user ? (
              <EmptyState
                icon={Zap}
                title="Bắt đầu chơi để nhận năng lượng"
                description="Năng lượng miễn phí được tặng ngay khi bạn bắt đầu luyện tập."
                action={<ButtonLink to="/endless">Chơi ngay</ButtonLink>}
              />
            ) : loading && !energy ? (
              <div className="space-y-4">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-2 w-full" />
              </div>
            ) : energy ? (
              <BalanceSummary
                free={energy.free}
                allowance={energy.daily_allowance}
                paid={energy.paid}
                resetsAt={energy.resets_at}
                plusUntil={energy.unlimited ? energy.plus_until : null}
              />
            ) : null}
          </Card>

          <Card className="p-6 sm:p-7">
            <h2 className="text-ink-50 text-sm font-semibold">Năng lượng hoạt động thế nào?</h2>
            <ul className="text-ink-300 mt-4 space-y-3 text-sm">
              <HowItem>Mỗi câu trả lời dùng 1 năng lượng, đúng hay sai đều vậy.</HowItem>
              <HowItem>Đề thi thường trừ đủ số câu khi bạn bắt đầu làm bài.</HowItem>
              <HowItem>
                Mỗi ngày được tặng 30 năng lượng — <strong className="text-ink-100">60</strong> nếu
                bạn có tài khoản. Nạp lại lúc 0 giờ, không cộng dồn.
              </HowItem>
              <HowItem>Năng lượng đã nạp không bao giờ hết hạn và chỉ dùng sau phần miễn phí.</HowItem>
              <HowItem>Easy Quiz Plus: luyện không giới hạn, không cần đếm năng lượng.</HowItem>
            </ul>
          </Card>
        </div>

        {/* ── Guest / signed-out notice ───────────────────────────────── */}
        {user && isGuest ? (
          <Card className="border-neon-400/40 mt-6 flex flex-wrap items-center gap-4 p-5">
            <Gift className="text-neon-300 size-6 shrink-0" aria-hidden />
            <p className="text-ink-200 min-w-0 flex-1 text-sm">
              Bạn đang chơi với tư cách khách. Tạo tài khoản miễn phí để nhận{' '}
              <strong className="text-ink-50">60 năng lượng mỗi ngày</strong> và mở khoá nạp thêm —
              năng lượng đã mua sẽ luôn được giữ lại.
            </p>
            <ButtonLink to="/register" size="sm">
              <UserPlus className="size-4" aria-hidden />
              Tạo tài khoản
            </ButtonLink>
          </Card>
        ) : null}

        {/* ── Store ───────────────────────────────────────────────────── */}
        <section className="mt-12" aria-labelledby="store-heading">
          <h2 id="store-heading" className="font-display text-ink-50 text-xl font-semibold tracking-tight">
            Nạp thêm
          </h2>
          <p className="text-ink-400 mt-1 text-sm">
            Thanh toán qua mã VietQR bằng app ngân hàng hoặc ví điện tử, xử lý bởi PayOS.
          </p>

          {products.loading ? (
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-56 w-full rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              {packs.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  canBuy={canBuy}
                  signedIn={!!user}
                  loading={buying === product.id}
                  disabled={buying !== null}
                  onBuy={() => void buy(product)}
                />
              ))}
              {plans.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  featured
                  canBuy={canBuy}
                  signedIn={!!user}
                  loading={buying === product.id}
                  disabled={buying !== null}
                  onBuy={() => void buy(product)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function BalanceSummary({
  free,
  allowance,
  paid,
  resetsAt,
  plusUntil,
}: {
  free: number
  allowance: number
  paid: number
  resetsAt: string
  plusUntil: string | null
}) {
  if (plusUntil) {
    return (
      <div>
        <div className="flex items-center gap-3">
          <span className="border-violet-glow-400/40 bg-violet-glow-500/10 text-violet-glow-300 flex size-11 items-center justify-center rounded-2xl border">
            <Crown className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-ink-50 font-display text-lg font-semibold">Easy Quiz Plus</p>
            <p className="text-ink-400 text-sm">Luyện không giới hạn đến hết ngày {formatDay(plusUntil)}.</p>
          </div>
        </div>
        <p className="text-ink-400 mt-5 text-xs">
          Gia hạn trước khi hết hạn sẽ được cộng nối tiếp, không mất ngày nào.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-ink-400 text-xs tracking-wide uppercase">Còn lại</p>
          <p className="font-display text-ink-50 mt-1 flex items-center gap-2 text-4xl font-semibold tabular-nums">
            <Zap className="text-spark-300 size-7" aria-hidden />
            {free + paid}
          </p>
        </div>
        <p className="text-ink-400 text-right text-xs">
          Nạp lại sau
          <br />
          <span className="text-ink-100 text-sm font-medium">{formatTimeUntil(resetsAt)}</span>
        </p>
      </div>

      <div className="mt-6">
        <div className="text-ink-300 flex justify-between text-xs">
          <span>Miễn phí hôm nay</span>
          <span className="tabular-nums">
            {free}/{allowance}
          </span>
        </div>
        <ProgressBar
          className="mt-2"
          percent={allowance > 0 ? (free / allowance) * 100 : 0}
          barClassName="bg-spark-400"
        />
      </div>

      <div className="text-ink-300 mt-4 flex justify-between text-xs">
        <span>Đã nạp (không hết hạn)</span>
        <span className="text-ink-100 tabular-nums">{paid}</span>
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

function ProductCard({
  product,
  featured = false,
  canBuy,
  signedIn,
  loading,
  disabled,
  onBuy,
}: {
  product: StoreProduct
  featured?: boolean
  canBuy: boolean
  signedIn: boolean
  loading: boolean
  disabled: boolean
  onBuy: () => void
}) {
  const Icon = product.kind === 'plus' ? Crown : Zap

  return (
    <Card
      id={product.kind === 'plus' ? 'plus' : undefined}
      data-cy={`product-${product.id}`}
      className={cn(
        'flex flex-col p-6',
        featured && 'border-violet-glow-400/60 shadow-[0_0_40px_-12px] shadow-violet-500/40',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            'flex size-10 items-center justify-center rounded-xl border',
            featured
              ? 'border-violet-glow-400/40 bg-violet-glow-500/10 text-violet-glow-300'
              : 'border-spark-400/40 bg-spark-400/10 text-spark-300',
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        {featured ? (
          <Badge tone="violet" icon={Sparkles}>
            Không giới hạn
          </Badge>
        ) : null}
      </div>

      <h3 className="font-display text-ink-50 mt-5 text-lg font-semibold">{product.name}</h3>
      {product.description ? (
        <p className="text-ink-300 mt-1.5 flex-1 text-sm">{product.description}</p>
      ) : (
        <div className="flex-1" />
      )}

      <p className="font-display text-ink-50 mt-5 text-2xl font-semibold tabular-nums">
        {formatVnd(product.price_vnd)}
        {product.kind === 'plus' ? (
          <span className="text-ink-400 text-sm font-normal"> / {product.plus_days} ngày</span>
        ) : null}
      </p>

      <div className="mt-5">
        {canBuy ? (
          <Button
            className="w-full"
            variant={featured ? 'primary' : 'secondary'}
            loading={loading}
            disabled={disabled}
            onClick={onBuy}
          >
            {loading ? null : <Icon className="size-4" aria-hidden />}
            {product.kind === 'plus' ? 'Tham gia Plus' : 'Nạp ngay'}
          </Button>
        ) : (
          <ButtonLink to={signedIn ? '/register' : '/login?redirect=%2Fenergy'} variant="outline" className="w-full">
            {signedIn ? 'Tạo tài khoản để mua' : 'Đăng nhập để mua'}
          </ButtonLink>
        )}
      </div>
    </Card>
  )
}
