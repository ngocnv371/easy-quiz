const rawSiteUrl = import.meta.env.VITE_SITE_URL?.trim()

export const APP_NAME = 'Easy Quiz'
export const BRAND_NAME = 'AiTechX'
export const BRAND_URL = import.meta.env.VITE_BRAND_URL?.trim() || 'https://aitechx.vn'

/**
 * Canonical origin of the deployed site.
 *
 * `VITE_SITE_URL` wins when set (local dev points it at `http://localhost:5173`),
 * but the production host is the default so a build that forgets the variable
 * still emits correct canonical and Open Graph URLs instead of `localhost`.
 * The trailing slash is stripped so `absoluteUrl()` never doubles it.
 */
export const SITE_URL = (
  rawSiteUrl && rawSiteUrl !== '' ? rawSiteUrl : 'https://easyquiz.aitechx.vn'
).replace(/\/+$/, '')

export const TAGLINE = 'Học vui, nhớ lâu'

export const APP_DESCRIPTION =
  'Khám phá đề trắc nghiệm theo chủ đề, chơi ngay không cần tài khoản, và leo bảng xếp hạng sau mỗi lượt. Giáo viên tạo đề nhanh gấp mười lần với AI Assist.'

/** The title a page gets when it does not set one of its own. */
export const HOME_TITLE = `${APP_NAME} — ${TAGLINE} | ${BRAND_NAME}`

/** Title of a sub-page, e.g. `Thư viện đề thi | Easy Quiz`. */
export function pageTitle(title: string): string {
  return `${title} | ${APP_NAME}`
}

/** Absolute URL for a site-relative path (absolute URLs pass through). */
export function absoluteUrl(path = '/'): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Social share card. Must be a raster image — the crawlers that read
 * `og:image` do not render SVG. `public/og-image.svg` is the editable source.
 */
export const SOCIAL_IMAGE_PATH = '/og-image.png'
export const SOCIAL_IMAGE_URL = absoluteUrl(SOCIAL_IMAGE_PATH)
export const SOCIAL_IMAGE_ALT = `${APP_NAME} — ${TAGLINE}. Nền tảng trắc nghiệm của AiTechX.`
