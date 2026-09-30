/// <reference types="vite/client" />

/**
 * Declared explicitly so `import.meta.env` is typed instead of `any`.
 * Only `VITE_`-prefixed variables are exposed to the browser by Vite.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SITE_URL?: string
  readonly VITE_BRAND_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
