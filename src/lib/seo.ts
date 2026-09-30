import { useEffect } from 'react'

import {
  absoluteUrl,
  APP_DESCRIPTION,
  APP_NAME,
  HOME_TITLE,
  pageTitle,
  SOCIAL_IMAGE_ALT,
  SOCIAL_IMAGE_URL,
} from './site'

export interface PageMeta {
  /** Page name, suffixed with the brand: `Thư viện đề thi | Easy Quiz`. Omit on the home page. */
  title?: string
  /** Meta description. Falls back to the site-wide description. */
  description?: string
  /**
   * Site-relative path used for the canonical link and `og:url`. Pass the
   * *clean* path (no query string), so filtered or paginated views consolidate
   * onto one URL instead of competing with each other.
   */
  path?: string
  /** Site-relative override for the social card. Rarely needed. */
  image?: string
  type?: 'website' | 'article'
  /** Keep thin or private screens out of the index (account, auth, 404…). */
  noIndex?: boolean
  /** Optional schema.org data for this screen, replaced on every navigation. */
  jsonLd?: Record<string, unknown> | null
}

function upsertMeta(attribute: 'name' | 'property', key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)

  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }

  element.setAttribute('content', content)
}

function upsertLink(rel: string, href: string): void {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)

  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', rel)
    document.head.appendChild(element)
  }

  element.setAttribute('href', href)
}

/**
 * Keeps the document head in step with the screen being shown.
 *
 * Easy Quiz is a client-rendered SPA, so `index.html` carries the tags for the
 * landing page and this hook rewrites them on every navigation. Crawlers that
 * execute JavaScript (Google, Bing) index the per-page values; the static tags
 * stay as the honest fallback for everyone else.
 *
 * Call it unconditionally at the top of a route component, before any early
 * `return` — hooks cannot be skipped. Values that arrive with async data simply
 * update the tags on the next render.
 */
export function usePageMeta({
  title,
  description,
  path,
  image,
  type = 'website',
  noIndex = false,
  jsonLd = null,
}: PageMeta): void {
  // Serialise once so the effect below only re-runs when the data really changes
  // (an inline `jsonLd` object is a new reference on every render).
  const jsonLdText = jsonLd ? JSON.stringify(jsonLd) : null

  useEffect(() => {
    const fullTitle = title ? pageTitle(title) : HOME_TITLE
    const url = absoluteUrl(path ?? window.location.pathname)
    const summary = description ?? APP_DESCRIPTION
    const socialImage = image ? absoluteUrl(image) : SOCIAL_IMAGE_URL

    document.title = fullTitle

    upsertMeta('name', 'description', summary)
    upsertMeta('name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow')
    upsertLink('canonical', url)

    upsertMeta('property', 'og:type', type)
    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', summary)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:site_name', APP_NAME)
    upsertMeta('property', 'og:locale', 'vi_VN')
    upsertMeta('property', 'og:image', socialImage)
    upsertMeta('property', 'og:image:alt', SOCIAL_IMAGE_ALT)

    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', fullTitle)
    upsertMeta('name', 'twitter:description', summary)
    upsertMeta('name', 'twitter:image', socialImage)
    upsertMeta('name', 'twitter:image:alt', SOCIAL_IMAGE_ALT)
  }, [title, description, path, image, type, noIndex])

  useEffect(() => {
    const id = 'page-json-ld'
    const existing = document.getElementById(id)

    if (!jsonLdText) {
      existing?.remove()
      return
    }

    const script =
      existing instanceof HTMLScriptElement ? existing : document.createElement('script')

    script.id = id
    script.type = 'application/ld+json'
    script.textContent = jsonLdText

    if (!existing) document.head.appendChild(script)
  }, [jsonLdText])
}
