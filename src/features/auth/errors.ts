import { errorMessage } from '@/lib/utils'

/** Better Auth's error codes, in words a player can act on. */
const AUTH_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Email hoặc mật khẩu không đúng.',
  INVALID_EMAIL: 'Email không hợp lệ.',
  INVALID_PASSWORD: 'Mật khẩu không đúng.',
  EMAIL_NOT_VERIFIED:
    'Email này chưa được xác nhận. Hãy mở liên kết trong email chúng tôi đã gửi, rồi đăng nhập lại.',
  PASSWORD_TOO_SHORT: 'Mật khẩu quá ngắn.',
  PASSWORD_TOO_LONG: 'Mật khẩu quá dài.',
  USER_ALREADY_EXISTS: 'Email này đã được dùng cho một tài khoản khác.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Email này đã được dùng cho một tài khoản khác.',
  ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY: 'Bạn đang ở trong một phiên chơi ẩn danh rồi.',
}

/** The message to show for a failed sign-in, sign-up or similar. */
export function authErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const { code, status } = error as { code?: unknown; status?: unknown }
    if (typeof code === 'string' && AUTH_MESSAGES[code]) return AUTH_MESSAGES[code]
    if (status === 429) return 'Bạn thử quá nhiều lần. Hãy chờ một lát rồi thử lại.'
  }
  return errorMessage(error)
}

/** Shown once when a session we were relying on turned out to be gone. */
export const SESSION_ENDED_MESSAGE =
  'Phiên đăng nhập đã hết hạn hoặc bị đăng xuất ở nơi khác. Bạn đã được đưa về chế độ khách — hãy đăng nhập lại để tiếp tục lưu kết quả.'
