// Small helpers shared by the Worker's modules.

// ISO time in UTC, as the tables store it (the same shape as Date#toISOString)
export const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
export const nowIso = () => new Date().toISOString()

export const uuid = () => crypto.randomUUID()

// A refusal the page shows as is: `message` is written for a person (Vietnamese), `code` is for
// the page's logic (e.g. 'out_of_energy'), `extra` goes into the JSON reply alongside them.
export class AppError extends Error {
  readonly status: number
  readonly code?: string
  readonly extra?: Record<string, unknown>

  constructor(message: string, status = 400, code?: string, extra?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

// SQLite keeps booleans as 0/1; the page wants true/false.
export function bools<T extends Record<string, unknown>>(row: T, ...keys: (keyof T)[]): T {
  const out: Record<string, unknown> = { ...row }
  for (const key of keys) if (key in out && out[key as string] !== null) out[key as string] = Boolean(out[key as string])
  return out as T
}

// Vietnamese-aware slug ("Lịch sử 9" -> "lich-su-9"), the same as slugify() in src/lib/utils.ts.
export function slugify(input: string | null | undefined): string {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// 5 characters to tell two slugs apart
export const slugSuffix = () => uuid().replace(/-/g, '').slice(0, 5)

export const trimTo = (value: unknown, max: number): string | null => {
  const text = typeof value === 'string' ? value.trim() : ''
  return text === '' ? null : text.slice(0, max)
}

export const oneOf = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback

export const toInt = (value: unknown, fallback: number): number => {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

// Several rows in one statement: `?1` is a JSON array of objects, read with json_each, so a whole
// question set is one bound parameter however long it is (D1 allows 100 per statement).
export const jsonRows = (rows: unknown[]) => JSON.stringify(rows)
