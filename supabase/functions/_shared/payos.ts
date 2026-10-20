// ═══════════════════════════════════════════════════════════════════════════
// PayOS — the small slice of its merchant API that Easy Quiz uses
//
//   createPaymentLink()  POST /v2/payment-requests     → checkout URL
//   getPaymentRequest()  GET  /v2/payment-requests/:id → current status
//   verifyWebhook()      HMAC check of a webhook body's `data`
//
// Every request and webhook is signed with HMAC-SHA256 under the checksum
// key. Credentials come from the function's environment:
//   PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY
// ═══════════════════════════════════════════════════════════════════════════

const PAYOS_API = 'https://api-merchant.payos.vn'

export interface PayosConfig {
  clientId: string
  apiKey: string
  checksumKey: string
}

/** Null when any credential is missing. */
export function payosConfig(): PayosConfig | null {
  const clientId = Deno.env.get('PAYOS_CLIENT_ID')?.trim()
  const apiKey = Deno.env.get('PAYOS_API_KEY')?.trim()
  const checksumKey = Deno.env.get('PAYOS_CHECKSUM_KEY')?.trim()
  if (!clientId || !apiKey || !checksumKey) return null
  return { clientId, apiKey, checksumKey }
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Compares two hex strings without short-circuiting on the first mismatch. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return diff === 0
}

function sortObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((sorted, key) => {
      sorted[key] = value[key]
      return sorted
    }, {})
}

/**
 * PayOS's canonical form for webhook data: keys sorted, `key=value` joined by
 * `&`, null-ish values as empty strings, arrays as JSON of key-sorted objects.
 * Mirrors the official SDK so signatures match byte for byte.
 */
function toSignedQuery(data: Record<string, unknown>): string {
  const sorted = sortObject(data)
  return Object.keys(sorted)
    .filter((key) => sorted[key] !== undefined)
    .map((key) => {
      let value = sorted[key]
      if (Array.isArray(value)) {
        value = JSON.stringify(
          value.map((item) =>
            item && typeof item === 'object' ? sortObject(item as Record<string, unknown>) : item,
          ),
        )
      }
      if (value === null || value === undefined || value === 'null' || value === 'undefined') {
        value = ''
      }
      return `${key}=${value}`
    })
    .join('&')
}

export interface PaymentLinkInput {
  orderCode: number
  amount: number
  /** Shown in the bank transfer. PayOS caps this at 25 characters (9 for some banks). */
  description: string
  items: { name: string; quantity: number; price: number }[]
  returnUrl: string
  cancelUrl: string
  /** Unix seconds. */
  expiredAt?: number
}

export interface PaymentLink {
  checkoutUrl: string
  paymentLinkId: string
}

export async function createPaymentLink(
  config: PayosConfig,
  input: PaymentLinkInput,
): Promise<PaymentLink> {
  // The request signature covers exactly these five fields, alphabetically.
  const signature = await hmacSha256Hex(
    config.checksumKey,
    `amount=${input.amount}&cancelUrl=${input.cancelUrl}&description=${input.description}` +
      `&orderCode=${input.orderCode}&returnUrl=${input.returnUrl}`,
  )

  const response = await fetch(`${PAYOS_API}/v2/payment-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': config.clientId,
      'x-api-key': config.apiKey,
    },
    body: JSON.stringify({ ...input, signature }),
  })

  const body = (await response.json().catch(() => null)) as {
    code?: string
    desc?: string
    data?: { checkoutUrl?: string; paymentLinkId?: string } | null
  } | null

  if (!response.ok || body?.code !== '00' || !body.data?.checkoutUrl) {
    throw new Error(`PayOS từ chối tạo link thanh toán: ${body?.desc ?? response.status}`)
  }

  return {
    checkoutUrl: body.data.checkoutUrl,
    paymentLinkId: body.data.paymentLinkId ?? '',
  }
}

export type PayosStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'CANCELLED' | 'EXPIRED' | string

export interface PaymentRequestInfo {
  status: PayosStatus
  amount: number
  amountPaid: number
  raw: unknown
}

export async function getPaymentRequest(
  config: PayosConfig,
  orderCode: number,
): Promise<PaymentRequestInfo> {
  const response = await fetch(`${PAYOS_API}/v2/payment-requests/${orderCode}`, {
    headers: { 'x-client-id': config.clientId, 'x-api-key': config.apiKey },
  })

  const body = (await response.json().catch(() => null)) as {
    code?: string
    desc?: string
    data?: { status?: string; amount?: number; amountPaid?: number } | null
  } | null

  if (!response.ok || body?.code !== '00' || !body.data) {
    throw new Error(`Không tra cứu được đơn trên PayOS: ${body?.desc ?? response.status}`)
  }

  return {
    status: body.data.status ?? 'PENDING',
    amount: Number(body.data.amount ?? 0),
    amountPaid: Number(body.data.amountPaid ?? 0),
    raw: body.data,
  }
}

export interface PayosWebhook {
  code?: string
  desc?: string
  success?: boolean
  data?: Record<string, unknown> & { orderCode?: number; amount?: number; code?: string }
  signature?: string
}

/** True when the webhook's `data` was signed with our checksum key. */
export async function verifyWebhook(config: PayosConfig, body: PayosWebhook): Promise<boolean> {
  if (!body.data || typeof body.signature !== 'string') return false
  const expected = await hmacSha256Hex(config.checksumKey, toSignedQuery(body.data))
  return safeEqual(expected, body.signature.toLowerCase())
}

/** Exposed for tests: the exact string a payload's signature is computed over. */
export const __test = { toSignedQuery, hmacSha256Hex }
