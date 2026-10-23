/**
 * Calls to the Worker's `/api/*` (worker/index.ts).
 *
 * Same origin as the page, so the session cookie goes along by itself. A
 * refusal comes back as `{ error, code?, … }`; `api()` throws it as an
 * `ApiError` whose message is already written for a person.
 */

export class ApiError extends Error {
  readonly status: number
  /** Machine-readable reason, e.g. `out_of_energy`, `insufficient_credits`. */
  readonly code: string | null
  /** The rest of the reply (e.g. `energy` with an out-of-energy refusal). */
  readonly body: Record<string, unknown>

  constructor(message: string, status: number, body: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = typeof body.code === 'string' ? body.code : null
    this.body = body
  }
}

export interface ApiInit {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
}

export async function api<T>(path: string, { method = 'GET', body }: ApiInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError('Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại.', 0, {})
  }

  if (!res.ok) {
    const info = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const message = typeof info.error === 'string' && info.error !== '' ? info.error : `Lỗi máy chủ (${res.status}).`
    throw new ApiError(message, res.status, info)
  }

  return (res.status === 204 ? null : await res.json()) as T
}

/** Like `api()`, but a 404 is a normal outcome and comes back as `null`. */
export async function apiOrNull<T>(path: string, init?: ApiInit): Promise<T | null> {
  try {
    return await api<T>(path, init)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** A query string from the defined, non-empty values. */
export function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text === '' ? '' : `?${text}`
}
