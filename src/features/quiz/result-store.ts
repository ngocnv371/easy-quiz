import type { SubmitResult } from '@/lib/domain'

/**
 * A freshly graded attempt is kept in `sessionStorage` so the result page can
 * render the full per-question review without a round trip.
 *
 * The server is still the source of truth: if this cache is missing (a shared
 * link, a new tab, a cleared session) the result page falls back to reading
 * the attempt, and simply shows the summary instead of the review.
 */

const STORAGE_KEY = 'easy-quiz.results'
const MAX_ENTRIES = 6

type Store = Record<string, SubmitResult>

function readStore(): Store {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {}
  } catch {
    // Private mode or corrupted entry — treat as empty rather than throwing.
    return {}
  }
}

function writeStore(store: Store): void {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Storage full or unavailable: the review is a nice-to-have, not a
    // requirement, so failing silently is the right call.
  }
}

export function stashResult(result: SubmitResult): void {
  const store = readStore()
  store[result.attempt.id] = result

  const ids = Object.keys(store)
  if (ids.length > MAX_ENTRIES) {
    for (const id of ids.slice(0, ids.length - MAX_ENTRIES)) {
      delete store[id]
    }
  }

  writeStore(store)
}

export function readResult(attemptId: string): SubmitResult | null {
  return readStore()[attemptId] ?? null
}

export function clearResult(attemptId: string): void {
  const store = readStore()
  if (attemptId in store) {
    delete store[attemptId]
    writeStore(store)
  }
}
