import { useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  BadgeCheck,
  Banknote,
  Globe,
  Infinity as InfinityIcon,
  ListChecks,
  Receipt,
  Search,
  Users,
} from 'lucide-react'

import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/field'
import { formatVnd } from '@/features/ads/format'
import { VerticalBarChart, type ChartTone } from '@/features/manage/charts'
import {
  fetchSiteOrders,
  fetchSiteOverview,
  fetchSiteUsers,
  type SiteDay,
  type SiteOrderStatus,
  type SiteUserSort,
} from '@/features/manage/api'
import { formatCompact, formatDate, formatRelative } from '@/lib/format'
import { useAsyncData } from '@/lib/use-async-data'
import { cn } from '@/lib/utils'

const METRICS: Array<{ key: Exclude<keyof SiteDay, 'day'>; label: string; tone: ChartTone }> = [
  { key: 'active_players', label: 'Người hoạt động', tone: 'neon' },
  { key: 'new_players', label: 'Người mới', tone: 'violet' },
  { key: 'attempts', label: 'Lượt làm bài', tone: 'spark' },
  { key: 'endless_answers', label: 'Câu vô tận', tone: 'correct' },
]

const ORDER_STATUS: Record<SiteOrderStatus, { label: string; tone: BadgeTone }> = {
  paid: { label: 'Đã thanh toán', tone: 'correct' },
  pending: { label: 'Đang chờ', tone: 'spark' },
  cancelled: { label: 'Đã huỷ', tone: 'neutral' },
  expired: { label: 'Hết hạn', tone: 'neutral' },
  failed: { label: 'Thất bại', tone: 'wrong' },
}

/** "2026-10-30" → "30/10" */
const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`

/**
 * The whole site at a glance: who plays, how much, and what has been bought.
 * Every number comes from the Worker (worker/admin.ts), which leaves the seeded
 * leaderboard players out.
 */
export function ManageStatsPage() {
  const overview = useAsyncData('manage:overview', fetchSiteOverview)
  const totals = overview.data?.totals
  const [metric, setMetric] = useState(METRICS[0]!)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SiteUserSort>('recent')
  // Search once typing pauses, not on every key.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])
  const users = useAsyncData(`manage:users:${sort}:${search}`, () => fetchSiteUsers(search, sort))

  const [status, setStatus] = useState<SiteOrderStatus | ''>('')
  const orders = useAsyncData(`manage:orders:${status}`, () => fetchSiteOrders(status))

  return (
    <div className="p-6 lg:p-10">
      <Badge tone="neon" icon={Globe}>
        Toàn hệ thống
      </Badge>
      <h1 className="font-display mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Thống kê</h1>
      <p className="text-ink-300 mt-2 max-w-xl text-sm leading-relaxed">
        Người chơi, mức độ sử dụng và đơn hàng trên toàn Easy Quiz. Không tính người chơi mẫu trên
        bảng xếp hạng.
      </p>

      {overview.error ? <p className="text-wrong-300 mt-6 text-sm">{overview.error}</p> : null}

      {/* ── Headline numbers ─────────────────────────────────────────── */}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3" data-cy="stats-totals">
        <Stat
          label="Người chơi"
          icon={Users}
          value={totals && formatCompact(totals.players)}
          detail={totals && `${formatCompact(totals.accounts)} tài khoản · +${totals.new_7d} trong 7 ngày`}
        />
        <Stat
          label="Hoạt động 7 ngày"
          icon={Activity}
          tone="correct"
          value={totals && formatCompact(totals.active_7d)}
          detail="Người đã làm bài hoặc luyện vô tận"
        />
        <Stat
          label="Lượt làm bài · 7 ngày"
          icon={ListChecks}
          tone="spark"
          value={totals && formatCompact(totals.attempts_7d)}
          detail={totals && `${formatCompact(totals.attempts)} lượt từ trước đến nay`}
        />
        <Stat
          label="Câu vô tận · 7 ngày"
          icon={InfinityIcon}
          tone="violet"
          value={totals && formatCompact(totals.endless_answers_7d)}
          detail={totals && `${formatCompact(totals.endless_answers)} câu từ trước đến nay`}
        />
        <Stat
          label="Doanh thu"
          icon={Banknote}
          tone="correct"
          value={totals && formatVnd(totals.revenue_vnd)}
          detail={totals && `+${formatVnd(totals.revenue_7d_vnd)} trong 7 ngày · ${totals.orders_paid} đơn`}
        />
        <Stat
          label="Đã gỡ quảng cáo"
          icon={BadgeCheck}
          tone="violet"
          value={totals && formatCompact(totals.ad_free)}
          detail={totals && `${totals.orders_pending} đơn đang chờ thanh toán`}
        />
      </div>

      {/* ── Daily chart ──────────────────────────────────────────────── */}
      <Card className="mt-8 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-ink-50 text-sm font-semibold">14 ngày qua</h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chỉ số">
            {METRICS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={metric.key === item.key}
                onClick={() => setMetric(item)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  metric.key === item.key
                    ? 'border-neon-400/50 bg-neon-400/10 text-neon-300'
                    : 'border-ink-600/70 text-ink-300 hover:text-ink-50',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {overview.loading ? (
          <Skeleton className="mt-6 h-48 w-full" />
        ) : (
          <div className="mt-6 overflow-x-auto">
            <VerticalBarChart
              className="min-w-[560px]"
              tone={metric.tone}
              ariaLabel={`${metric.label} theo ngày trong 14 ngày qua`}
              data={(overview.data?.daily ?? []).map((day) => ({ label: shortDay(day.day), value: day[metric.key] }))}
            />
          </div>
        )}
      </Card>

      {/* ── Users ────────────────────────────────────────────────────── */}
      <Card className="mt-8 overflow-hidden">
        <div className="border-ink-600/60 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <h2 className="text-ink-50 inline-flex items-center gap-2 text-sm font-semibold">
            <Users className="text-neon-400 size-4" aria-hidden />
            Người chơi
          </h2>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
              <Search className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Tên, username hoặc email"
                aria-label="Tìm người chơi"
                className="pl-9"
                data-cy="stats-user-search"
              />
            </div>
            <Select
              value={sort}
              onChange={(event) => setSort(event.target.value as SiteUserSort)}
              aria-label="Sắp xếp"
              className="w-auto"
            >
              <option value="recent">Hoạt động gần đây</option>
              <option value="most">Chơi nhiều nhất</option>
              <option value="new">Mới tham gia</option>
            </Select>
          </div>
        </div>

        <TableState loading={users.loading} error={users.error} empty={(users.data ?? []).length === 0} emptyText="Không có người chơi nào khớp.">
          <table className="w-full min-w-[720px] text-sm" data-cy="stats-users">
            <thead>
              <tr className="text-ink-400 text-left text-xs">
                <Th>Người chơi</Th>
                <Th className="text-right">Lượt làm bài</Th>
                <Th className="text-right">Câu vô tận</Th>
                <Th>Hoạt động gần nhất</Th>
                <Th>Tham gia</Th>
              </tr>
            </thead>
            <tbody className="divide-ink-600/60 divide-y">
              {(users.data ?? []).map((user) => (
                <tr key={user.id}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span aria-hidden>{user.avatar_emoji}</span>
                      <div className="min-w-0">
                        <p className="text-ink-100 flex flex-wrap items-center gap-1.5 font-medium">
                          {user.display_name}
                          {user.role === 'admin' ? <Badge tone="spark">Admin</Badge> : null}
                          {user.ad_free_at ? <Badge tone="violet">Không QC</Badge> : null}
                        </p>
                        <p className="text-ink-400 truncate text-xs">{user.is_guest ? 'Khách' : (user.email ?? `@${user.username}`)}</p>
                      </div>
                    </div>
                  </td>
                  <Td className="text-right tabular-nums">{formatCompact(user.attempts)}</Td>
                  <Td className="text-right tabular-nums">{formatCompact(user.endless_answers)}</Td>
                  <Td>{user.last_active ? formatRelative(user.last_active) : 'Chưa chơi'}</Td>
                  <Td>{formatDate(user.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableState>
      </Card>

      {/* ── Orders ───────────────────────────────────────────────────── */}
      <Card className="mt-8 overflow-hidden">
        <div className="border-ink-600/60 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <h2 className="text-ink-50 inline-flex items-center gap-2 text-sm font-semibold">
            <Receipt className="text-neon-400 size-4" aria-hidden />
            Đơn hàng
          </h2>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as SiteOrderStatus | '')}
            aria-label="Lọc theo trạng thái"
            className="w-auto"
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(ORDER_STATUS).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </Select>
        </div>

        <TableState loading={orders.loading} error={orders.error} empty={(orders.data ?? []).length === 0} emptyText="Chưa có đơn hàng nào.">
          <table className="w-full min-w-[720px] text-sm" data-cy="stats-orders">
            <thead>
              <tr className="text-ink-400 text-left text-xs">
                <Th>Mã đơn</Th>
                <Th>Người mua</Th>
                <Th>Gói</Th>
                <Th className="text-right">Số tiền</Th>
                <Th>Trạng thái</Th>
                <Th>Tạo lúc</Th>
              </tr>
            </thead>
            <tbody className="divide-ink-600/60 divide-y">
              {(orders.data ?? []).map((order) => (
                <tr key={order.order_code}>
                  <Td className="text-ink-300 font-mono text-xs">
                    {order.order_code}
                    {order.provider === 'mock' ? <span className="text-ink-500"> · thử</span> : null}
                  </Td>
                  <Td>
                    {order.user_id ? (
                      <>
                        <p className="text-ink-100">
                          <span aria-hidden>{order.avatar_emoji} </span>
                          {order.display_name}
                        </p>
                        <p className="text-ink-400 text-xs">{order.email ?? `@${order.username}`}</p>
                      </>
                    ) : (
                      <span className="text-ink-400">Tài khoản đã xoá</span>
                    )}
                  </Td>
                  <Td>{order.product_name}</Td>
                  <Td className="text-right tabular-nums">{formatVnd(order.amount_vnd)}</Td>
                  <Td>
                    <Badge tone={ORDER_STATUS[order.status]?.tone ?? 'neutral'}>{ORDER_STATUS[order.status]?.label ?? order.status}</Badge>
                  </Td>
                  <Td title={order.paid_at ? `Thanh toán ${formatRelative(order.paid_at)}` : undefined}>
                    {formatRelative(order.created_at)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableState>
      </Card>
    </div>
  )
}

function Stat({
  label,
  icon: Icon,
  value,
  detail,
  tone = 'neon',
}: {
  label: string
  icon: typeof Users
  /** Undefined while loading. */
  value: string | undefined
  detail: string | undefined
  tone?: 'neon' | 'spark' | 'correct' | 'violet'
}) {
  const tones = {
    neon: 'border-neon-400/40 bg-neon-400/10 text-neon-300',
    spark: 'border-spark-400/40 bg-spark-400/10 text-spark-300',
    correct: 'border-correct-400/40 bg-correct-500/10 text-correct-300',
    violet: 'border-violet-glow-400/40 bg-violet-glow-500/10 text-violet-glow-300',
  } as const

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-ink-400 text-xs font-medium tracking-[0.16em] uppercase">{label}</p>
        <span className={`flex size-8 items-center justify-center rounded-lg border ${tones[tone]}`}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      {value === undefined ? (
        <>
          <Skeleton className="mt-3 h-8 w-20" />
          <Skeleton className="mt-2 h-3 w-40" />
        </>
      ) : (
        <>
          <p className="font-display text-ink-50 mt-2 text-2xl font-semibold tabular-nums">{value}</p>
          <p className="text-ink-400 mt-1 text-xs">{detail}</p>
        </>
      )}
    </Card>
  )
}

function TableState({
  loading,
  error,
  empty,
  emptyText,
  children,
}: {
  loading: boolean
  error: string | null
  empty: boolean
  emptyText: string
  children: ReactNode
}) {
  if (loading) {
    return (
      <div className="space-y-3 p-5">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    )
  }
  if (error) return <p className="text-wrong-300 p-5 text-sm">{error}</p>
  if (empty) return <p className="text-ink-400 p-5 text-sm">{emptyText}</p>
  return <div className="max-h-[32rem] overflow-auto">{children}</div>
}

function Th({ className, children }: { className?: string; children: ReactNode }) {
  return <th className={cn('bg-ink-900/95 sticky top-0 px-5 py-2.5 font-medium whitespace-nowrap', className)}>{children}</th>
}

function Td({ className, title, children }: { className?: string; title?: string; children: ReactNode }) {
  return (
    <td className={cn('text-ink-200 px-5 py-3 whitespace-nowrap', className)} title={title}>
      {children}
    </td>
  )
}
