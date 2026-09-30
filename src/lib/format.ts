const NUMBER_FORMAT = new Intl.NumberFormat('vi-VN')
const COMPACT_FORMAT = new Intl.NumberFormat('vi-VN', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatNumber(value: number): string {
  return NUMBER_FORMAT.format(value)
}

export function formatCompact(value: number): string {
  return value < 1000 ? NUMBER_FORMAT.format(value) : COMPACT_FORMAT.format(value)
}

/** `300` → `05:00`, `45` → `00:45`. Negative input clamps to zero. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** `95` → `1:35` for a duration a person actually read. */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  if (minutes === 0) return `${seconds} giây`
  if (seconds === 0) return `${minutes} phút`
  return `${minutes} phút ${seconds} giây`
}

export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value)}%`
}

const RELATIVE = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' })

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
]

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'

  const deltaSeconds = (then - Date.now()) / 1000

  for (const [unit, secondsInUnit] of UNITS) {
    if (Math.abs(deltaSeconds) >= secondsInUnit || unit === 'second') {
      return RELATIVE.format(Math.round(deltaSeconds / secondsInUnit), unit)
    }
  }

  return '—'
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date)
}

/** An ordinal that reads naturally in Vietnamese: 1 → "Nhất", 2 → "Nhì"… */
const ORDINALS = ['Nhất', 'Nhì', 'Ba', 'Tư', 'Năm']

export function rankLabel(rank: number): string {
  return ORDINALS[rank - 1] ?? `#${rank}`
}

export function medalFor(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return ''
}
