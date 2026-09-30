import { errorMessage } from '@/lib/utils'

/**
 * GoTrue reports a session whose backing user row is gone with this wording.
 * Worth recognising by name: it is not transient, and retrying will never fix
 * it. The only way out is to discard the session and start again.
 *
 * A live account cannot hit this — `handle_new_user` creates the profile row in
 * the same transaction as the user — so it means the account was deleted (an
 * admin removed it, the database was restored, the local stack was reset).
 */
const DEAD_SESSION_SIGNALS = [
  'user from sub claim in jwt does not exist',
  'session from session_id claim in jwt does not exist',
  'user not found',
  'refresh token not found',
]

function rawMessage(error: unknown): string {
  if (typeof error === 'string') return error

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }

  return ''
}

export function isDeadSessionError(error: unknown): boolean {
  const message = rawMessage(error).toLowerCase()
  if (message === '') return false

  return DEAD_SESSION_SIGNALS.some((signal) => message.includes(signal))
}

export const DEAD_SESSION_MESSAGE =
  'Phiên đăng nhập không còn hiệu lực vì tài khoản không còn tồn tại. Bạn đã được đưa về chế độ khách — hãy chơi tiếp, hoặc tạo tài khoản mới để lưu kết quả.'

/** A message worth showing a person, rather than a raw GoTrue string. */
export function authErrorMessage(error: unknown): string {
  return isDeadSessionError(error) ? DEAD_SESSION_MESSAGE : errorMessage(error)
}
