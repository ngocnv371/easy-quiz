import type { EnergyState } from '@/lib/domain'
import { ApiError, api } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

export type { EnergyState }

/**
 * Energy: every answered question costs one.
 *
 * The balance lives on the server (`energy_wallets`) and is only ever moved by
 * the Worker — grading an Endless answer, starting a quiz, or a paid order.
 * The client reads it and reacts to the out-of-energy refusal; it never writes.
 */

export interface StoreProduct {
  id: string
  kind: 'energy' | 'plus'
  name: string
  description: string | null
  energy: number
  plus_days: number
  price_vnd: number
  sort: number
}

export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'expired' | 'failed' | 'unknown'

/** Thrown in place of a generic error when the player cannot afford a charge. */
export class OutOfEnergyError extends Error {
  /** The balance at the moment of refusal, when the server sent it. */
  readonly energy: EnergyState | null

  constructor(message: string, energy: EnergyState | null) {
    super(message)
    this.name = 'OutOfEnergyError'
    this.energy = energy
  }
}

export function isOutOfEnergy(error: unknown): error is OutOfEnergyError {
  return error instanceof OutOfEnergyError
}

/**
 * Turns the Worker's `out_of_energy` refusal (HTTP 402, with the balance as
 * `energy`) into an `OutOfEnergyError`; anything else passes through.
 */
export function toEnergyError(error: unknown): Error {
  if (error instanceof ApiError && error.code === 'out_of_energy') {
    return new OutOfEnergyError(error.message, (error.body.energy as EnergyState | undefined) ?? null)
  }
  return error instanceof Error ? error : new Error(errorMessage(error))
}

export async function fetchMyEnergy(): Promise<EnergyState> {
  return api<EnergyState>('me/energy')
}

export async function fetchStoreProducts(): Promise<StoreProduct[]> {
  return api<StoreProduct[]>('store/products')
}

/** Creates an order and returns the PayOS page to send the buyer to. */
export async function startCheckout(productId: string): Promise<{ order_code: number; checkout_url: string }> {
  return api('payments/checkout', { method: 'POST', body: { product_id: productId } })
}

/** Asks the server to confirm an order with PayOS. Safe to call repeatedly. */
export async function syncOrder(orderCode: number): Promise<{ status: OrderStatus; energy?: EnergyState }> {
  return api('payments/sync', { method: 'POST', body: { order_code: orderCode } })
}
