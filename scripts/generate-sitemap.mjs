#!/usr/bin/env node
/**
 * Rewrites `public/sitemap.xml`: the site's pages, plus Endless scoped to each
 * topic (`/endless?topic=<slug>`), since playing is Endless only and a topic is
 * the way into a subject.
 *
 * The topics only exist at runtime, so a hand-written sitemap would always be
 * stale. This asks the site's own API (`/api/topics`) for the active ones.
 *
 * `VITE_SITE_URL` comes from `.env.local` and `.env.production` (production
 * wins, as it does in Vite), so nothing has to be exported by hand. Run it before a
 * production deploy; a failure keeps the existing file rather than emptying it.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(projectRoot, 'public/sitemap.xml')

const PRODUCTION_SITE_URL = 'https://easyquiz.aitechx.vn'

/** A minimal `KEY=value` reader — enough for Vite's env files, quotes and all. */
function readEnvFile(name) {
  const path = resolve(projectRoot, name)
  if (!existsSync(path)) return {}

  const values = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (!match) continue
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return values
}

const fileEnv = { ...readEnvFile('.env.local'), ...readEnvFile('.env.production') }
const pick = (key) => (process.env[key] ?? fileEnv[key] ?? '').trim()

// A sitemap must never advertise `localhost`; fall back to the real host.
const configuredSiteUrl = pick('VITE_SITE_URL')
const siteUrl = (
  configuredSiteUrl && !configuredSiteUrl.includes('localhost')
    ? configuredSiteUrl
    : PRODUCTION_SITE_URL
).replace(/\/+$/, '')

if (configuredSiteUrl && configuredSiteUrl !== siteUrl) {
  console.warn(`Bỏ qua VITE_SITE_URL=${configuredSiteUrl} — dùng ${siteUrl}.`)
}

// The live site's API by default; SITEMAP_API_URL points it elsewhere (e.g. http://localhost:5173).
const apiUrl = (pick('SITEMAP_API_URL') || siteUrl).replace(/\/+$/, '')
const endpoint = `${apiUrl}/api/topics`

let topics
try {
  const response = await fetch(endpoint, {
    headers: { accept: 'application/json' },
  })

  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)

  topics = await response.json()

  if (!Array.isArray(topics)) throw new Error('Phản hồi không phải là danh sách.')
} catch (error) {
  console.error('Không truy vấn được danh sách chủ đề; giữ nguyên sitemap hiện có.')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const STATIC_ROUTES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/endless', changefreq: 'daily', priority: '0.9' },
  { path: '/leaderboard', changefreq: 'daily', priority: '0.7' },
  { path: '/no-ads', changefreq: 'monthly', priority: '0.4' },
]

const today = new Date().toISOString().slice(0, 10)

const escapeXml = (value) =>
  value.replace(
    /[<>&'"]/g,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char],
  )

const entries = [
  ...STATIC_ROUTES.map((route) => ({
    loc: `${siteUrl}${route.path}`,
    lastmod: today,
    changefreq: route.changefreq,
    priority: route.priority,
  })),
  ...topics
    .filter((topic) => typeof topic?.slug === 'string' && topic.slug !== '')
    .map((topic) => ({
      loc: `${siteUrl}/endless?topic=${encodeURIComponent(topic.slug)}`,
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.8',
    })),
]

const body = entries
  .map(
    (entry) =>
      `  <url>\n` +
      `    <loc>${escapeXml(entry.loc)}</loc>\n` +
      `    <lastmod>${entry.lastmod}</lastmod>\n` +
      `    <changefreq>${entry.changefreq}</changefreq>\n` +
      `    <priority>${entry.priority}</priority>\n` +
      `  </url>`,
  )
  .join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`

writeFileSync(target, xml, 'utf8')
console.log(`Đã ghi ${entries.length} URL vào public/sitemap.xml (${topics.length} chủ đề).`)
