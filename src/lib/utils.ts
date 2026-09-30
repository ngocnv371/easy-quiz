import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Vietnamese-aware slug maker, mirroring `public.slugify()` in the database so
 * a link previewed in the browser matches what `save_quiz()` will store.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

/** A short, human-readable id for React keys inside the editor. */
export function draftId(): string {
  return `draft_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Deterministic shuffle. Seeded so a re-render does not reshuffle the answers
 * under the player's finger — the same quiz always starts the same way until
 * the seed changes.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items]
  let state = 2166136261

  for (let i = 0; i < seed.length; i += 1) {
    state ^= seed.charCodeAt(i)
    state = Math.imul(state, 16777619)
  }

  for (let i = out.length - 1; i > 0; i -= 1) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    const j = Math.abs(state) % (i + 1)
    const a = out[i] as T
    const b = out[j] as T
    out[i] = b
    out[j] = a
  }

  return out
}

/** Fisher–Yates using the platform RNG — for one-off moments like a new seed. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = out[i] as T
    const b = out[j] as T
    out[i] = b
    out[j] = a
  }
  return out
}

/** Narrow an unknown thrown value into a message worth showing a user. */
export function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim() !== '') return message
  }
  return 'Đã có lỗi xảy ra. Vui lòng thử lại.'
}

/** Collapse whitespace so a pasted prompt does not blow up the layout. */
export function tidyText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
