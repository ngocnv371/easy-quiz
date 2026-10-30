import { api } from '@/lib/api'

/**
 * The ad-free pass: one payment, through PayOS, and the ad break after each
 * session never shows again.
 *
 * Whether a player is ad-free lives on their profile (`profile.ad_free`, set by
 * the Worker once an order is paid). The client reads it; it never writes it.
 */

export interface StoreProduct {
  id: string
  kind: 'ad_free'
  name: string
  description: string | null
  price_vnd: number
  sort: number
}

export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'expired' | 'failed' | 'unknown'

export async function fetchStoreProducts(): Promise<StoreProduct[]> {
  return api<StoreProduct[]>('store/products')
}

/** Creates an order and returns the PayOS page to send the buyer to. */
export async function startCheckout(productId: string): Promise<{ order_code: number; checkout_url: string }> {
  return api('payments/checkout', { method: 'POST', body: { product_id: productId } })
}

/** Asks the server to confirm an order with PayOS. Safe to call repeatedly. */
export async function syncOrder(orderCode: number): Promise<{ status: OrderStatus; ad_free?: boolean }> {
  return api('payments/sync', { method: 'POST', body: { order_code: orderCode } })
}
