#!/usr/bin/env node
/**
 * Rewrites `public/sitemap.xml` from the quizzes published in Supabase.
 *
 * A quiz catalogue is the whole point of this site and its URLs only exist at
 * runtime, so a hand-written sitemap would always be stale. This queries the
 * Supabase REST API with the publishable (anon) key — the same credentials the
 * browser already holds, so row level security returns exactly the quizzes a
 * visitor can reach.
 *
 * Values come from `.env.local` and `.env.production` (production wins, as it
 * does in Vite), so nothing has to be exported by hand. Run it before a
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

const supabaseUrl = pick('VITE_SUPABASE_URL')
const anonKey = pick('VITE_SUPABASE_ANON_KEY')

if (!supabaseUrl || !anonKey) {
  console.error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY — không sinh được sitemap.')
  process.exit(1)
}

const endpoint =
  `${supabaseUrl}/rest/v1/quiz_cards` +
  '?select=slug,updated_at&status=eq.published&visibility=eq.public' +
  '&order=updated_at.desc.nullslast&limit=5000'

let quizzes
try {
  const response = await fetch(endpoint, {
    headers: { apikey: anonKey, accept: 'application/json' },
  })

  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)

  quizzes = await response.json()

  if (!Array.isArray(quizzes)) throw new Error('Phản hồi không phải là danh sách.')
} catch (error) {
  console.error('Không truy vấn được danh sách đề thi; giữ nguyên sitemap hiện có.')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const STATIC_ROUTES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/explore', changefreq: 'daily', priority: '0.9' },
  { path: '/leaderboard', changefreq: 'daily', priority: '0.7' },
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
  ...quizzes
    .filter((quiz) => typeof quiz?.slug === 'string' && quiz.slug !== '')
    .map((quiz) => ({
      loc: `${siteUrl}/q/${quiz.slug}`,
      lastmod: quiz.updated_at ? String(quiz.updated_at).slice(0, 10) : today,
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
console.log(`Đã ghi ${entries.length} URL vào public/sitemap.xml (${quizzes.length} đề thi).`)
