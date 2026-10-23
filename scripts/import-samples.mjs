#!/usr/bin/env node
/**
 * Imports every file in `samples/` through the admin importer (`/api/manage/import`).
 *
 * The admin console uploads one CSV at a time by hand; this is the same path
 * without the clicking, so a fresh database can be filled with the sample
 * banks in one command:
 *
 *   npm run import:samples            # everything in ./samples
 *   npm run import:samples -- some/dir # a different folder
 *
 * The site defaults to the dev server (http://localhost:5173); set
 * `IMPORT_SITE_URL` for another. A non-local target is refused unless
 * `IMPORT_ALLOW_REMOTE=1` is set.
 *
 * The importer is admin-only, so the script signs in first with
 * `IMPORT_ADMIN_EMAIL` / `IMPORT_ADMIN_PASSWORD` — an account whose email is
 * confirmed and that `npm run admin:promote` made an admin. Both can live in
 * `.env.local` (or the file named by `IMPORT_ENV_FILE`).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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

const envFiles = process.env.IMPORT_ENV_FILE
  ? [process.env.IMPORT_ENV_FILE]
  : ['.env', '.env.local']
const fileEnv = Object.assign({}, ...envFiles.map(readEnvFile))
const pick = (key) => (process.env[key] ?? fileEnv[key] ?? '').trim()

const siteUrl = (pick('IMPORT_SITE_URL') || 'http://localhost:5173').replace(/\/+$/, '')
const email = pick('IMPORT_ADMIN_EMAIL')
const password = pick('IMPORT_ADMIN_PASSWORD')

const samplesDir = resolve(projectRoot, process.argv[2] ?? 'samples')

if (!email || !password) {
  console.error('Thiếu IMPORT_ADMIN_EMAIL hoặc IMPORT_ADMIN_PASSWORD — đặt trong .env.local.')
  process.exit(1)
}

// Never write to a live site by accident.
if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/.test(siteUrl)) {
  if (process.env.IMPORT_ALLOW_REMOTE !== '1') {
    console.error(
      `Từ chối nhập vào ${siteUrl} — không phải máy cục bộ.\n` +
        'Đặt IMPORT_ALLOW_REMOTE=1 nếu bạn thật sự muốn nhập lên môi trường từ xa.',
    )
    process.exit(1)
  }
  console.warn(`Cảnh báo: đang nhập lên môi trường từ xa — ${siteUrl}`)
}

if (!existsSync(samplesDir)) {
  console.error(`Không tìm thấy thư mục: ${samplesDir}`)
  process.exit(1)
}

const files = readdirSync(samplesDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort()

if (files.length === 0) {
  console.error(`Thư mục trống: ${samplesDir}`)
  process.exit(1)
}

/** Signs in as the admin and returns the session cookie for the importer. */
async function signIn() {
  const response = await fetch(`${siteUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: siteUrl },
    body: JSON.stringify({ email, password }),
  })

  const body = await response.json().catch(() => null)
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')

  if (!response.ok || cookie === '') {
    throw new Error(`Đăng nhập thất bại cho ${email}: ${body?.message ?? body?.code ?? `HTTP ${response.status}`}`)
  }

  return cookie
}

/** Sends one CSV to the importer; resolves to its JSON summary. */
async function importFile(name, cookie) {
  const csv = readFileSync(resolve(samplesDir, name), 'utf8')

  const response = await fetch(`${siteUrl}/api/manage/import`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: siteUrl },
    body: JSON.stringify({ csv, filename: name }),
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(body?.error ?? `HTTP ${response.status} ${response.statusText}`)
  }

  return body
}

console.log(`Nhập ${files.length} tệp từ ${samplesDir} vào ${siteUrl} …`)

let cookie
try {
  cookie = await signIn()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const totals = { subjects: 0, quizzes: 0, questions: 0, skipped: 0, imported: 0 }
let failed = 0

for (const name of files) {
  // The importer only speaks CSV; anything else (a README, a .gitkeep) is left
  // alone rather than sent up to fail.
  if (extname(name).toLowerCase() !== '.csv') {
    console.log(`· bỏ qua ${name} (không phải CSV)`)
    continue
  }

  try {
    const result = await importFile(name, cookie)

    totals.subjects += result.subjects ?? 0
    totals.quizzes += result.quizzes ?? 0
    totals.questions += result.questions ?? 0
    totals.skipped += result.skipped_total ?? 0
    totals.imported += 1

    const skipped = result.skipped_total ?? 0
    console.log(
      `✓ ${name} — ${result.questions ?? 0} câu hỏi, ${result.subjects ?? 0} môn` +
        (skipped > 0 ? `, bỏ qua ${skipped} dòng` : ''),
    )

    if (skipped > 0) {
      for (const entry of result.skipped ?? []) {
        console.log(`    dòng ${entry.row}: ${entry.reason}`)
      }
    }
  } catch (error) {
    failed += 1
    console.error(`✗ ${name} — ${error instanceof Error ? error.message : error}`)
  }
}

console.log(
  `\nXong: ${totals.imported}/${files.length} tệp · ` +
    `${totals.questions} câu hỏi · ${totals.subjects} môn · ${totals.quizzes} đề mới` +
    (totals.skipped > 0 ? ` · ${totals.skipped} dòng bị bỏ qua` : ''),
)

if (failed > 0) {
  console.error(`${failed} tệp nhập thất bại.`)
  process.exit(1)
}
