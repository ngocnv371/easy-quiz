// ═══════════════════════════════════════════════════════════════════════════
// payments — checkout and status for energy packs and Plus
//
//   POST /functions/v1/payments { action: 'checkout', product_id }
//     → { order_code, checkout_url }
//   POST /functions/v1/payments { action: 'sync', order_code }
//     → { status, energy? }
//
// `checkout` creates a `payment_orders` row (price snapshotted from
// `store_products`) and a PayOS payment link for it. Guests cannot buy: a
// purchase must land on an account that survives a cleared browser.
//
// `sync` is the return page's safety net. The PayOS webhook is the primary
// signal, but it cannot reach a local stack and may lag in production, so the
// return page asks PayOS directly. Both paths end in the same idempotent
// `fulfill_payment_order()`, so a payment is never credited twice.
//
// Environment:
//   PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY   PayOS credentials
//   SITE_URL       where PayOS sends the buyer back (default http://localhost:5173)
//   PAYOS_MOCK     `true` skips PayOS and treats every order as paid on return.
//                  Honoured only against a local Supabase stack.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { createPaymentLink, getPaymentRequest, payosConfig } from '../_shared/payos.ts'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** How long a PayOS link stays payable. */
const LINK_TTL_SECONDS = 15 * 60

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function siteUrl(): string {
  return (Deno.env.get('SITE_URL') ?? 'http://localhost:5173').replace(/\/+$/, '')
}

/**
 * Mock mode exists so the whole flow can be clicked through locally without
 * PayOS credentials. It must never run against a real project, so it also
 * requires the local stack's internal URL.
 */
function mockMode(supabaseUrl: string): boolean {
  if ((Deno.env.get('PAYOS_MOCK') ?? '').toLowerCase() !== 'true') return false
  return /kong|localhost|127\.0\.0\.1/.test(supabaseUrl)
}

interface OrderRow {
  order_code: number
  user_id: string | null
  amount_vnd: number
  status: string
  checkout_url: string | null
}

async function fulfill(
  admin: SupabaseClient,
  orderCode: number,
  amountPaid: number,
  payload: unknown,
): Promise<{ status: string; energy?: unknown }> {
  const { data, error } = await admin.rpc('fulfill_payment_order', {
    p_order_code: orderCode,
    p_amount_paid: amountPaid,
    p_payload: payload ?? null,
  })
  if (error) throw new Error(error.message)
  return data as { status: string; energy?: unknown }
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Chỉ hỗ trợ POST.' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const authorization = request.headers.get('Authorization')

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: 'Edge Function thiếu biến môi trường Supabase.' }, 500)
    }

    if (!authorization) {
      return json({ error: 'Bạn cần đăng nhập.' }, 401)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    })
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

    const { data: caller } = await userClient.auth.getUser()
    const user = caller.user
    if (!user) {
      return json({ error: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.' }, 401)
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: string
      product_id?: string
      order_code?: number | string
    }

    const mock = mockMode(supabaseUrl)
    const config = payosConfig()

    // ── checkout ────────────────────────────────────────────────────────
    if (body.action === 'checkout') {
      const { data: profile } = await admin
        .from('profiles')
        .select('is_guest')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile || profile.is_guest || user.is_anonymous) {
        return json(
          { error: 'Hãy tạo tài khoản trước khi nạp, để năng lượng đã mua không bị mất.', code: 'guest' },
          403,
        )
      }

      const { data: product } = await admin
        .from('store_products')
        .select('id, name, energy, plus_days, price_vnd, active')
        .eq('id', String(body.product_id ?? ''))
        .maybeSingle()

      if (!product || !product.active) {
        return json({ error: 'Gói này không còn bán.' }, 404)
      }

      if (!config && !mock) {
        return json({ error: 'Cổng thanh toán chưa được cấu hình.' }, 503)
      }

      const { data: order, error: orderError } = await admin
        .from('payment_orders')
        .insert({
          user_id: user.id,
          product_id: product.id,
          amount_vnd: product.price_vnd,
          energy: product.energy,
          plus_days: product.plus_days,
          provider: mock ? 'mock' : 'payos',
        })
        .select('order_code')
        .single()

      if (orderError || !order) {
        return json({ error: `Không tạo được đơn hàng: ${orderError?.message ?? ''}` }, 500)
      }

      const orderCode = Number(order.order_code)
      const returnUrl = `${siteUrl()}/energy/return`
      const cancelUrl = `${siteUrl()}/energy/return?cancel=true`

      let checkoutUrl: string
      let paymentLinkId: string | null = null

      if (mock) {
        checkoutUrl = `${returnUrl}?orderCode=${orderCode}&status=PAID&mock=1`
      } else {
        try {
          const link = await createPaymentLink(config!, {
            orderCode,
            amount: product.price_vnd,
            description: 'Easy Quiz',
            items: [{ name: product.name.slice(0, 50), quantity: 1, price: product.price_vnd }],
            returnUrl,
            cancelUrl,
            expiredAt: Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS,
          })
          checkoutUrl = link.checkoutUrl
          paymentLinkId = link.paymentLinkId
        } catch (linkError) {
          await admin.from('payment_orders').update({ status: 'failed' }).eq('order_code', orderCode)
          throw linkError
        }
      }

      await admin
        .from('payment_orders')
        .update({ checkout_url: checkoutUrl, payment_link_id: paymentLinkId })
        .eq('order_code', orderCode)

      return json({ order_code: orderCode, checkout_url: checkoutUrl })
    }

    // ── sync ────────────────────────────────────────────────────────────
    if (body.action === 'sync') {
      const orderCode = Number(body.order_code)
      if (!Number.isSafeInteger(orderCode) || orderCode <= 0) {
        return json({ error: 'Mã đơn không hợp lệ.' }, 400)
      }

      const { data: order } = await admin
        .from('payment_orders')
        .select('order_code, user_id, amount_vnd, status, checkout_url')
        .eq('order_code', orderCode)
        .maybeSingle<OrderRow>()

      if (!order || order.user_id !== user.id) {
        return json({ error: 'Không tìm thấy đơn hàng.' }, 404)
      }

      if (order.status !== 'pending') {
        return json({ status: order.status })
      }

      if (mock) {
        const result = await fulfill(admin, orderCode, order.amount_vnd, { mock: true })
        return json(result)
      }

      if (!config) {
        return json({ error: 'Cổng thanh toán chưa được cấu hình.' }, 503)
      }

      const info = await getPaymentRequest(config, orderCode)

      if (info.status === 'PAID') {
        const result = await fulfill(admin, orderCode, info.amountPaid, info.raw)
        return json(result)
      }

      if (info.status === 'CANCELLED' || info.status === 'EXPIRED') {
        const status = info.status === 'CANCELLED' ? 'cancelled' : 'expired'
        await admin
          .from('payment_orders')
          .update({ status, provider_payload: info.raw })
          .eq('order_code', orderCode)
          .eq('status', 'pending')
        return json({ status })
      }

      return json({ status: 'pending', checkout_url: order.checkout_url })
    }

    return json({ error: 'Yêu cầu không hợp lệ.' }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[payments]', message)
    return json({ error: message }, 502)
  }
})
