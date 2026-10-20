// ═══════════════════════════════════════════════════════════════════════════
// payos-webhook — PayOS calls this when a payment link is paid
//
//   POST /functions/v1/payos-webhook   (no JWT: PayOS is the caller)
//
// Trust comes from the HMAC signature over `data`, not from the caller. A
// valid, successful notification is handed to `fulfill_payment_order()`,
// which is idempotent and checks the paid amount against the order.
//
// When the webhook URL is registered, PayOS sends a test payload for an order
// that does not exist. That is answered 200 so the registration succeeds.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2'

import { payosConfig, verifyWebhook, type PayosWebhook } from '../_shared/payos.ts'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return json({ error: 'method' }, 405)
  }

  const config = payosConfig()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!config || !supabaseUrl || !serviceRoleKey) {
    console.error('[payos-webhook] missing configuration')
    return json({ error: 'not configured' }, 503)
  }

  const body = (await request.json().catch(() => null)) as PayosWebhook | null
  if (!body) return json({ error: 'bad json' }, 400)

  if (!(await verifyWebhook(config, body))) {
    console.warn('[payos-webhook] rejected: bad signature')
    return json({ error: 'bad signature' }, 401)
  }

  const data = body.data ?? {}
  const orderCode = Number(data.orderCode)
  const paid = body.code === '00' && (data.code === undefined || data.code === '00')

  if (!paid || !Number.isSafeInteger(orderCode)) {
    return json({ ok: true, ignored: true })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data: result, error } = await admin.rpc('fulfill_payment_order', {
    p_order_code: orderCode,
    p_amount_paid: Number(data.amount ?? 0),
    p_payload: body as unknown as Record<string, unknown>,
  })

  if (error) {
    // A 5xx makes PayOS retry later, which is what we want for a transient fault.
    console.error('[payos-webhook] fulfil failed', orderCode, error.message)
    return json({ error: 'fulfil failed' }, 500)
  }

  return json({ ok: true, result })
})
