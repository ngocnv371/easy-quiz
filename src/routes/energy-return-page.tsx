import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Clock, Crown, XCircle, Zap } from 'lucide-react'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { ButtonLink, Spinner } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/features/auth/auth-context'
import { syncOrder, type OrderStatus } from '@/features/energy/api'
import { useEnergy } from '@/features/energy/energy-context'
import { usePageMeta } from '@/lib/seo'
import { errorMessage } from '@/lib/utils'

/** How many times to ask again while a bank transfer is still settling. */
const MAX_POLLS = 10
const POLL_MS = 3000

/**
 * Where PayOS sends the buyer back: `/energy/return?orderCode=…&status=…`.
 *
 * The query string is only a hint — anyone can type it. The page asks the
 * server, which checks with PayOS before crediting anything, and keeps asking
 * for a little while if the transfer has not landed yet.
 */
export function EnergyReturnPage() {
  const [params] = useSearchParams()
  const { status: authStatus, user } = useAuth()
  const { refresh, energy } = useEnergy()

  const orderCode = Number(params.get('orderCode'))
  const cancelled = params.get('cancel') === 'true'

  const [status, setStatus] = useState<OrderStatus | 'checking'>('checking')
  const [error, setError] = useState<string | null>(null)
  const pollsRef = useRef(0)

  usePageMeta({ title: 'Kết quả thanh toán', path: '/energy/return', noIndex: true })

  useEffect(() => {
    if (authStatus !== 'ready' || !user) return
    if (!Number.isSafeInteger(orderCode) || orderCode <= 0) {
      setStatus('unknown')
      return
    }

    let alive = true
    let timer: number | undefined

    const check = async () => {
      try {
        const result = await syncOrder(orderCode)
        if (!alive) return

        if (result.status === 'pending' && !cancelled && pollsRef.current < MAX_POLLS) {
          pollsRef.current += 1
          setStatus('pending')
          timer = window.setTimeout(() => void check(), POLL_MS)
          return
        }

        setStatus(result.status)
        if (result.status === 'paid') void refresh()
      } catch (syncError) {
        if (alive) setError(errorMessage(syncError))
      }
    }

    void check()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [authStatus, user, orderCode, cancelled, refresh])

  return (
    <div className="relative">
      <AuroraBackground />
      <div className="container-page relative flex min-h-[60vh] items-center justify-center py-14">
        <Card className="animate-pop w-full max-w-md p-7 text-center" data-cy="payment-result">
          {authStatus === 'ready' && !user ? (
            <Result icon={XCircle} tone="text-ink-300" title="Hãy đăng nhập lại">
              Đăng nhập bằng tài khoản đã mua để xem kết quả. Thanh toán thành công vẫn được cộng tự
              động.
            </Result>
          ) : error ? (
            <Result icon={XCircle} tone="text-wrong-300" title="Chưa xác nhận được thanh toán">
              {error} Nếu bạn đã chuyển khoản, năng lượng sẽ được cộng tự động trong ít phút.
            </Result>
          ) : status === 'checking' || (status === 'pending' && !cancelled) ? (
            <Result icon={Clock} tone="text-spark-300" title="Đang xác nhận thanh toán…" spinner>
              Vui lòng chờ trong giây lát, đừng đóng trang này.
            </Result>
          ) : status === 'paid' ? (
            <Result
              icon={energy?.unlimited ? Crown : CheckCircle2}
              tone="text-correct-300"
              title="Thanh toán thành công!"
            >
              {energy?.unlimited
                ? 'Easy Quiz Plus đã được kích hoạt. Chúc bạn học vui!'
                : `Năng lượng đã được cộng vào tài khoản${energy ? ` — bạn đang có ${energy.total}.` : '.'}`}
            </Result>
          ) : status === 'cancelled' || cancelled ? (
            <Result icon={XCircle} tone="text-ink-300" title="Bạn đã huỷ thanh toán">
              Chưa có khoản nào bị trừ. Bạn có thể chọn lại gói bất cứ lúc nào.
            </Result>
          ) : status === 'pending' ? (
            <Result icon={Clock} tone="text-spark-300" title="Đang chờ ngân hàng">
              Giao dịch chưa về. Năng lượng sẽ được cộng tự động ngay khi PayOS xác nhận.
            </Result>
          ) : (
            <Result icon={XCircle} tone="text-wrong-300" title="Thanh toán không thành công">
              Đơn hàng đã hết hạn hoặc không hợp lệ. Bạn chưa bị trừ tiền cho đơn này.
            </Result>
          )}

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/endless">
              <Zap className="size-4" aria-hidden />
              Luyện tiếp
            </ButtonLink>
            <ButtonLink to="/energy" variant="outline">
              Về trang năng lượng
            </ButtonLink>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Result({
  icon: Icon,
  tone,
  title,
  spinner = false,
  children,
}: {
  icon: typeof Clock
  tone: string
  title: string
  spinner?: boolean
  children: ReactNode
}) {
  return (
    <>
      <span className="border-ink-600 bg-ink-800/70 mx-auto flex size-14 items-center justify-center rounded-2xl border">
        {spinner ? <Spinner className={`size-6 ${tone}`} /> : <Icon className={`size-7 ${tone}`} aria-hidden />}
      </span>
      <h1 className="font-display text-ink-50 mt-5 text-xl font-semibold">{title}</h1>
      <p className="text-ink-300 mt-2 text-sm leading-relaxed">{children}</p>
    </>
  )
}
