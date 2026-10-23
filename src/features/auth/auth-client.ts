import { createAuthClient } from 'better-auth/react'
import { anonymousClient, inferAdditionalFields } from 'better-auth/client/plugins'

/**
 * Better Auth on the Worker (`worker/auth.ts`), same origin under `/api/auth`.
 * The anonymous plugin is what "Chơi ngay" signs in with.
 */
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [
    anonymousClient(),
    inferAdditionalFields({ user: { organization: { type: 'string', required: false } } }),
  ],
})
