import type { EnergyState } from '@/lib/domain'
import { requireSupabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'

export type { EnergyState }

/**
 * Energy: every answered question costs one.
 *
 * The balance lives on the server (`energy_wallets`) and is only ever moved by
 * the database — grading an Endless answer, starting a quiz, or a paid order.
 * The client reads it and reacts to the out-of-energy error; it never writes.
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

/** SQLSTATE the database raises when a charge cannot be afforded. */
const OUT_OF_ENERGY_CODE = 'EQ001'

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
 * Turns a PostgREST error into an `OutOfEnergyError` when it is one. The
 * database puts the current balance in the error's `details` as JSON.
 */
export function toEnergyError(error: { code?: string; message?: string; details?: string | null }): Error {
  if (error.code !== OUT_OF_ENERGY_CODE) return new Error(errorMessage(error))

  let energy: EnergyState | null = null
  try {
    energy = error.details ? (JSON.parse(error.details) as EnergyState) : null
  } catch {
    energy = null
  }

  return new OutOfEnergyError(errorMessage(error), energy)
}

export async function fetchMyEnergy(): Promise<EnergyState> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('get_my_energy')
  if (error) throw toEnergyError(error)
  return data as unknown as EnergyState
}

export async function fetchStoreProducts(): Promise<StoreProduct[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('store_products')
    .select('id, kind, name, description, energy, plus_days, price_vnd, sort')
    .order('sort', { ascending: true })

  if (error) throw new Error(errorMessage(error))
  return (data ?? []) as StoreProduct[]
}

/** Pulls the function's own `{ error }` message out of a non-2xx response. */
async function invokePayments<T>(body: Record<string, unknown>): Promise<T> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.functions.invoke('payments', { body })

  if (error) {
    let message = errorMessage(error)
    const context = (error as { context?: unknown }).context

    if (context instanceof Response) {
      try {
        const payload = (await context.clone().json()) as { error?: unknown }
        if (typeof payload.error === 'string' && payload.error !== '') message = payload.error
      } catch {
        // Body was not JSON — keep the original message.
      }
    }

    throw new Error(message)
  }

  return data as T
}

/** Creates an order and returns the PayOS page to send the buyer to. */
export async function startCheckout(productId: string): Promise<{ order_code: number; checkout_url: string }> {
  return invokePayments({ action: 'checkout', product_id: productId })
}

/** Asks the server to confirm an order with PayOS. Safe to call repeatedly. */
export async function syncOrder(orderCode: number): Promise<{ status: OrderStatus; energy?: EnergyState }> {
  return invokePayments({ action: 'sync', order_code: orderCode })
}
