// The ad-free pass through PayOS (https://payos.vn/docs/api/).
//   checkout(member, product)  creates an order (the product's price and grant copied onto it) and
//                              a PayOS link; guests can't buy, so a purchase always lands on an account
//   sync(member, orderCode)    the return page asks PayOS directly, so credit arrives even if the
//                              webhook is late (or can't reach a local dev server)
//   webhook(body)              PayOS's callback, trusted by its HMAC signature
// Both sync and the webhook end in fulfil(), which credits an order exactly once.
//
// Secrets: PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY. Locally, PAYOS_MOCK=1 (and no PayOS
// keys) skips PayOS: checkout goes straight back to the return page and the order counts as paid.
import type { Env, Member } from './env.ts'
import { AppError, NOW, uuid } from './sql.ts'

const PAYOS = 'https://api-merchant.payos.vn'
// how long a PayOS link stays payable
const LINK_TTL_SECONDS = 15 * 60
const enc = new TextEncoder()

export const isMock = (env: Env) => !env.PAYOS_CLIENT_ID && env.PAYOS_MOCK === '1'
const configured = (env: Env) => Boolean(env.PAYOS_CLIENT_ID && env.PAYOS_API_KEY && env.PAYOS_CHECKSUM_KEY)

async function hmacHex(env: Env, text: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.PAYOS_CHECKSUM_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text)))
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// PayOS's canonical form for signed data: keys sorted, key=value joined with &, null -> '', arrays
// as JSON of key-sorted objects. Mirrors the official SDK byte for byte.
function signedString(data: Record<string, unknown>) {
  const sortKeys = (o: unknown) =>
    o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, (o as Record<string, unknown>)[k]])) : o
  return Object.keys(data)
    .sort()
    .filter((k) => data[k] !== undefined)
    .map((k) => {
      let v = data[k]
      if (Array.isArray(v)) v = JSON.stringify(v.map(sortKeys))
      if (v === null || v === 'null' || v === 'undefined') v = ''
      return `${k}=${v}`
    })
    .join('&')
}

async function payos<T>(env: Env, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${PAYOS}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-client-id': env.PAYOS_CLIENT_ID!, 'x-api-key': env.PAYOS_API_KEY!, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const out = (await res.json().catch(() => null)) as { code?: string; desc?: string; data?: T } | null
  if (!res.ok || out?.code !== '00' || !out.data) throw new Error(`payOS ${path}: ${out?.code ?? res.status} ${out?.desc ?? ''}`)
  return out.data
}

// PayOS orderCode: a positive integer, unique for the merchant. Millisecond time keeps a local
// database's codes apart from production's when they share a PayOS account.
const newOrderCode = () => Date.now() * 10 + Math.floor(Math.random() * 10)

// Marks an order paid and credits it, once. One batch (one transaction): the first statement only
// matches a pending order paid in full, and stamps it with this call's token; everything after
// only acts on an order carrying that token, so a repeated webhook or return check is a no-op.
// Returns the order's status afterwards and whether this call paid it.
export async function fulfil(db: D1Database, orderCode: number, amountPaid: number, payload: unknown) {
  const token = uuid()
  const res = await db.batch([
    db.prepare(`update payment_orders set status = 'paid', paid_at = ${NOW}, fulfil_token = ?2, provider_payload = ?4, updated_at = ${NOW}
        where order_code = ?1 and status = 'pending' and amount_vnd <= ?3`).bind(orderCode, token, amountPaid, JSON.stringify(payload ?? null)),
    db.prepare(`update payment_orders set status = 'failed', provider_payload = ?3, updated_at = ${NOW}
        where order_code = ?1 and status = 'pending' and amount_vnd > ?2`).bind(orderCode, amountPaid, JSON.stringify(payload ?? null)),
    // buying it twice keeps the first date
    db.prepare(`update profiles set ad_free_at = coalesce(ad_free_at, ${NOW}), updated_at = ${NOW}
        where id = (select user_id from payment_orders where order_code = ?1 and fulfil_token = ?2 and ad_free = 1)`).bind(orderCode, token),
    db.prepare('select status, user_id, amount_vnd, fulfil_token = ?2 as mine from payment_orders where order_code = ?1').bind(orderCode, token),
  ])
  const row = res[3]!.results[0] as { status: string; user_id: string | null; amount_vnd: number; mine: number } | undefined
  return { status: row?.status ?? 'unknown', paid: Boolean(row?.mine), userId: row?.user_id ?? null, amount: row?.amount_vnd ?? 0 }
}

const isAdFree = async (db: D1Database, userId: string) =>
  Boolean(await db.prepare('select 1 from profiles where id = ? and ad_free_at is not null').bind(userId).first())

export async function listProducts(db: D1Database) {
  const { results } = await db
    .prepare('select id, kind, name, description, price_vnd, sort from store_products where active = 1 order by sort')
    .all()
  return results
}

export async function checkout(env: Env, member: Member, productId: string, origin: string) {
  if (member.isAnonymous || member.isGuest) {
    throw new AppError('Hãy tạo tài khoản trước khi mua, để gói đã mua không bị mất.', 403, 'guest')
  }
  if (await isAdFree(env.DB, member.id)) throw new AppError('Tài khoản của bạn đã gỡ quảng cáo rồi.', 409, 'already_ad_free')
  const product = await env.DB.prepare('select * from store_products where id = ? and active = 1').bind(productId)
    .first<{ id: string; kind: string; name: string; price_vnd: number }>()
  if (!product) throw new AppError('Gói này không còn bán.', 404)
  const mock = isMock(env)
  if (!mock && !configured(env)) throw new AppError('Cổng thanh toán chưa được cấu hình.', 503)

  const orderCode = newOrderCode()
  await env.DB.prepare('insert into payment_orders (order_code, user_id, product_id, amount_vnd, ad_free, provider) values (?, ?, ?, ?, ?, ?)')
    .bind(orderCode, member.id, product.id, product.price_vnd, product.kind === 'ad_free' ? 1 : 0, mock ? 'mock' : 'payos')
    .run()

  // PayOS sends the buyer back to the site they bought on
  const returnUrl = `${origin}/no-ads/return`
  const cancelUrl = `${origin}/no-ads/return?cancel=true`
  let checkoutUrl = `${returnUrl}?orderCode=${orderCode}&status=PAID&mock=1`
  let paymentLinkId: string | null = null
  if (!mock) {
    const req = {
      orderCode,
      amount: product.price_vnd,
      description: 'Easy Quiz', // shown in the bank transfer; ≤ 25 characters
      items: [{ name: product.name.slice(0, 50), quantity: 1, price: product.price_vnd }],
      returnUrl,
      cancelUrl,
      expiredAt: Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS,
    }
    const signature = await hmacHex(env, signedString({ amount: req.amount, cancelUrl, description: req.description, orderCode, returnUrl }))
    try {
      const link = await payos<{ checkoutUrl: string; paymentLinkId: string }>(env, '/v2/payment-requests', { ...req, signature })
      checkoutUrl = link.checkoutUrl
      paymentLinkId = link.paymentLinkId
    } catch (e) {
      await env.DB.prepare(`update payment_orders set status = 'failed', updated_at = ${NOW} where order_code = ?`).bind(orderCode).run()
      throw new AppError(`PayOS từ chối tạo link thanh toán: ${(e as Error).message}`, 502)
    }
  }
  await env.DB.prepare(`update payment_orders set checkout_url = ?, payment_link_id = ?, updated_at = ${NOW} where order_code = ?`)
    .bind(checkoutUrl, paymentLinkId, orderCode)
    .run()
  return { order_code: orderCode, checkout_url: checkoutUrl, price_vnd: product.price_vnd, product_id: product.id }
}

// The return page's check: { status, ad_free? }. Safe to call repeatedly.
export async function sync(env: Env, member: Member, orderCode: number) {
  if (!Number.isSafeInteger(orderCode) || orderCode <= 0) throw new AppError('Mã đơn không hợp lệ.')
  const order = await env.DB.prepare('select order_code, user_id, amount_vnd, status, checkout_url from payment_orders where order_code = ?')
    .bind(orderCode)
    .first<{ order_code: number; user_id: string | null; amount_vnd: number; status: string; checkout_url: string | null }>()
  if (!order || order.user_id !== member.id) throw new AppError('Không tìm thấy đơn hàng.', 404)

  const withAdFree = async (status: string) => ({ status, ad_free: await isAdFree(env.DB, member.id) })
  if (order.status !== 'pending') return order.status === 'paid' ? withAdFree('paid') : { status: order.status }

  let result: Awaited<ReturnType<typeof fulfil>> | null = null
  if (isMock(env)) result = await fulfil(env.DB, orderCode, order.amount_vnd, { mock: true })
  else {
    if (!configured(env)) throw new AppError('Cổng thanh toán chưa được cấu hình.', 503)
    const info = await payos<{ status: string; amount?: number; amountPaid?: number }>(env, `/v2/payment-requests/${orderCode}`)
    if (info.status === 'PAID') result = await fulfil(env.DB, orderCode, Number(info.amountPaid ?? info.amount ?? 0), info)
    else if (info.status === 'CANCELLED' || info.status === 'EXPIRED') {
      const status = info.status === 'CANCELLED' ? 'cancelled' : 'expired'
      await env.DB.prepare(`update payment_orders set status = ?, provider_payload = ?, updated_at = ${NOW} where order_code = ? and status = 'pending'`)
        .bind(status, JSON.stringify(info), orderCode)
        .run()
      return { status }
    } else return { status: 'pending', checkout_url: order.checkout_url }
  }
  return { ...(result.status === 'paid' ? await withAdFree('paid') : { status: result.status }), paid_now: result.paid, amount: result.amount }
}

// PayOS's callback. Its "confirm webhook" test sends a sample payment for an order we don't have:
// that just gets an OK, so registering the URL succeeds.
export async function webhook(env: Env, body: { code?: string; success?: boolean; data?: Record<string, unknown>; signature?: string } | null) {
  if (!env.PAYOS_CHECKSUM_KEY) return { status: 503 as const, body: { error: 'not configured' } }
  if (!body?.data || typeof body.signature !== 'string' || body.signature.toLowerCase() !== (await hmacHex(env, signedString(body.data)))) {
    return { status: 401 as const, body: { error: 'bad signature' } }
  }
  const orderCode = Number(body.data.orderCode)
  const paid = body.code === '00' && (body.data.code === undefined || body.data.code === '00')
  if (!paid || !Number.isSafeInteger(orderCode)) return { status: 200 as const, body: { ok: true, ignored: true } }
  const result = await fulfil(env.DB, orderCode, Number(body.data.amount ?? 0), body)
  return { status: 200 as const, body: { ok: true }, result }
}
