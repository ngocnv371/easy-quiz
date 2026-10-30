import { useAuth } from '@/features/auth/auth-context'

/**
 * Google AdSense: the publisher id (`ca-pub-…`) and the ad break's display
 * unit. Both are public (they sit in the page's HTML), so production builds
 * carry them here rather than in the git-ignored `.env.production`, which the
 * build on Cloudflare never sees. VITE_ADSENSE_CLIENT / VITE_ADSENSE_SLOT
 * override them.
 *
 * `npm run dev` has neither, so the ad break shows a house ad for the ad-free
 * pass instead and the flow is the same everywhere. public/ads.txt must name
 * the same publisher.
 */
export const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT ?? (import.meta.env.PROD ? 'ca-pub-3599233318321564' : '')
export const ADSENSE_SLOT = import.meta.env.VITE_ADSENSE_SLOT ?? (import.meta.env.PROD ? '3350981167' : '')
export const adsenseConfigured = ADSENSE_CLIENT !== '' && ADSENSE_SLOT !== ''

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

let loading: Promise<void> | null = null

/**
 * Adds the AdSense script once, on the first ad break, so a player who never
 * finishes a session (or never sees ads) never downloads it. Rejects when it is
 * blocked, which the caller treats as "show the house ad".
 */
export function loadAdsense(): Promise<void> {
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.async = true
      script.crossOrigin = 'anonymous'
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`
      script.onload = () => resolve()
      script.onerror = () => {
        loading = null
        reject(new Error('AdSense blocked'))
      }
      document.head.appendChild(script)
    })
  }
  return loading
}

/**
 * Whether this player gets an ad break. Everyone does, guests and signed-out
 * players included, except an account that bought the ad-free pass (and admins,
 * whose profile reports ad-free too). Undecided while the session is loading.
 */
export function useShowAds(): boolean {
  const { status, profile } = useAuth()
  if (status === 'loading') return false
  return !profile?.ad_free
}
