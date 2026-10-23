// Energy: every answered question costs one (energy_wallets, migrations/0002_app.sql).
//   · a free daily allowance (guests 30, accounts 60) refills at midnight Vietnam time, doesn't carry
//     over, and is spent before bought energy
//   · bought energy never expires; Plus (plus_until in the future) and admins are never charged
//   · Endless charges per graded answer (endless.ts); a quiz charges its question count when it
//     starts and hands out a ticket that submitting redeems (play.ts)
//
// D1 can't hold a transaction open across statements, so a spend is one guarded update: it only
// applies if the balances are still the ones it read, and is retried otherwise. The ledger row is
// written in the same batch and only if that update applied.
import { AppError, NOW, nowIso, uuid } from './sql.ts'

const VN_OFFSET_MS = 7 * 3600_000

// The Vietnam day (UTC+7 all year) as YYYY-MM-DD.
export const vnToday = () => new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10)
const nextVnMidnight = () => new Date(Date.parse(`${vnToday()}T00:00:00Z`) + 864e5 - VN_OFFSET_MS).toISOString()

// Tune the free allowance here. Accounts get more, which is a reason to sign up and a brake on
// clearing storage for a fresh guest quota.
export const dailyAllowance = (guest: boolean) => (guest ? 30 : 60)

export interface Wallet {
  user_id: string
  free_balance: number
  free_allowance: number
  free_date: string | null
  paid_balance: number
  plus_until: string | null
}

// What every energy-aware reply carries (EnergyState in src/lib/domain.ts).
export function energyState(w: Wallet) {
  return {
    free: w.free_balance,
    paid: w.paid_balance,
    total: w.free_balance + w.paid_balance,
    daily_allowance: w.free_allowance,
    resets_at: nextVnMidnight(),
    plus_until: w.plus_until,
    unlimited: Boolean(w.plus_until && w.plus_until > nowIso()),
  }
}

// The member's wallet, made if missing, with today's free allowance applied (a new day refills it;
// a guest who signed up today gets the difference straight away).
export async function touchWallet(db: D1Database, userId: string): Promise<{ wallet: Wallet; isAdmin: boolean }> {
  const profile = await db.prepare('select is_guest, role from profiles where id = ?').bind(userId).first<{ is_guest: number; role: string }>()
  if (!profile) throw new AppError('Không tìm thấy hồ sơ.', 404)
  const allowance = dailyAllowance(Boolean(profile.is_guest))
  const today = vnToday()
  const res = await db.batch([
    db.prepare('insert into energy_wallets (user_id) values (?) on conflict (user_id) do nothing').bind(userId),
    db.prepare(`update energy_wallets set free_balance = ?2, free_allowance = ?2, free_date = ?3, updated_at = ${NOW}
        where user_id = ?1 and (free_date is null or free_date <> ?3)`).bind(userId, allowance, today),
    db.prepare(`update energy_wallets set free_balance = free_balance + (?2 - free_allowance), free_allowance = ?2, updated_at = ${NOW}
        where user_id = ?1 and free_date = ?3 and free_allowance < ?2`).bind(userId, allowance, today),
    db.prepare('select * from energy_wallets where user_id = ?').bind(userId),
  ])
  return { wallet: res[3]!.results[0] as Wallet, isAdmin: profile.role === 'admin' }
}

export async function myEnergy(db: D1Database, userId: string) {
  return energyState((await touchWallet(db, userId)).wallet)
}

// Takes `amount` energy, today's free allowance first. Throws AppError 'out_of_energy' (402, with
// the balance as `energy`) when the member can't afford it; the page then offers a refill.
export async function spendEnergy(db: D1Database, userId: string, amount: number, reason: string, ref: string) {
  for (let tries = 0; tries < 5; tries += 1) {
    const { wallet, isAdmin } = await touchWallet(db, userId)
    const state = energyState(wallet)
    if (amount <= 0 || state.unlimited || isAdmin) return state
    if (state.total < amount) {
      throw new AppError(
        'Bạn đã hết năng lượng. Năng lượng miễn phí được nạp lại lúc 0 giờ mỗi ngày, hoặc bạn có thể nạp thêm ngay.',
        402,
        'out_of_energy',
        { energy: state, needed: amount },
      )
    }
    const fromFree = Math.min(wallet.free_balance, amount)
    const fromPaid = amount - fromFree
    const free = wallet.free_balance - fromFree
    const paid = wallet.paid_balance - fromPaid
    const [spent] = await db.batch([
      db.prepare(`update energy_wallets set free_balance = ?2, paid_balance = ?3, updated_at = ${NOW}
          where user_id = ?1 and free_balance = ?4 and paid_balance = ?5 and free_date = ?6`)
        .bind(userId, free, paid, wallet.free_balance, wallet.paid_balance, wallet.free_date),
      db.prepare(`insert into energy_ledger (id, user_id, bucket, delta, balance_after, reason, ref)
          select column1, ?1, column2, column3, column4, ?2, ?3
          from (values (?4, 'free', ?5, ?6), (?7, 'paid', ?8, ?9))
          where column3 <> 0 and changes() = 1`)
        .bind(userId, reason, ref.slice(0, 120), uuid(), -fromFree, free, uuid(), -fromPaid, paid),
    ])
    if (spent!.meta.changes) return energyState({ ...wallet, free_balance: free, paid_balance: paid })
  }
  throw new AppError('Máy chủ đang bận, hãy thử lại.', 503)
}
