/// <reference types="vite/client" />

/**
 * Declared explicitly so `import.meta.env` is typed instead of `any`.
 * Only `VITE_`-prefixed variables are exposed to the browser by Vite.
 */
interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string
  readonly VITE_BRAND_URL?: string
  /** AdSense publisher id (`ca-pub-…`) and the ad break's unit (src/features/ads/adsense.ts). */
  readonly VITE_ADSENSE_CLIENT?: string
  readonly VITE_ADSENSE_SLOT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
