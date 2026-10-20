const VND = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })

export function formatVnd(amount: number): string {
  return VND.format(amount)
}

/** "3 giờ 12 phút" until an ISO instant; "vài giây" once it is that close. */
export function formatTimeUntil(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((new Date(iso).getTime() - now) / 60_000))
  if (minutes < 1) return 'vài giây'

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} phút`
  return rest === 0 ? `${hours} giờ` : `${hours} giờ ${rest} phút`
}

/** "20/11/2026" for a Plus expiry. */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
