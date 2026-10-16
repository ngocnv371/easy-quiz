#!/usr/bin/env node
/**
 * Imports every file in `samples/` through the `import-questions` edge function.
 *
 * The admin console uploads one CSV at a time by hand; this is the same path
 * without the clicking, so a fresh database can be filled with the sample
 * banks in one command:
 *
 *   npm run import:samples            # everything in ./samples
 *   npm run import:samples -- some/dir # a different folder
 *
 * Credentials come from `.env` then `.env.local` (local wins, as in Vite) — set
 * `IMPORT_ENV_FILE` to read a single different file instead. Because a stray
 * `VITE_SUPABASE_URL` can point at production, a non-local target is refused
 * unless `IMPORT_ALLOW_REMOTE=1` is set.
 *
 * The importer is admin-only, so the script signs in as an admin first. The
 * demo admin seeded for local development is used by default; override with
 * `IMPORT_ADMIN_EMAIL` / `IMPORT_ADMIN_PASSWORD` for any other project.
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

const supabaseUrl = pick('VITE_SUPABASE_URL').replace(/\/+$/, '')
const anonKey = pick('VITE_SUPABASE_ANON_KEY')
const email = pick('IMPORT_ADMIN_EMAIL') || 'admin@easyquiz.local'
const password = pick('IMPORT_ADMIN_PASSWORD') || 'easyquiz123'

const samplesDir = resolve(projectRoot, process.argv[2] ?? 'samples')

if (!supabaseUrl || !anonKey) {
  console.error(
    'Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY — sao chép .env.example sang .env.local.',
  )
  process.exit(1)
}

// `.env` can hold a production project; never write there by accident.
if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/.test(supabaseUrl)) {
  if (process.env.IMPORT_ALLOW_REMOTE !== '1') {
    console.error(
      `Từ chối nhập vào ${supabaseUrl} — không phải máy cục bộ.\n` +
        'Đặt IMPORT_ALLOW_REMOTE=1 nếu bạn thật sự muốn nhập lên môi trường từ xa.',
    )
    process.exit(1)
  }
  console.warn(`Cảnh báo: đang nhập lên môi trường từ xa — ${supabaseUrl}`)
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

/** Signs in as the admin and returns a bearer token for the edge function. */
async function signIn() {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  const body = await response.json().catch(() => null)

  if (!response.ok || typeof body?.access_token !== 'string') {
    const reason =
      body?.error_description ?? body?.msg ?? body?.error ?? `HTTP ${response.status}`
    throw new Error(`Đăng nhập thất bại cho ${email}: ${reason}`)
  }

  return body.access_token
}

/** Sends one CSV to the edge function; resolves to its JSON summary. */
async function importFile(name, token) {
  const csv = readFileSync(resolve(samplesDir, name), 'utf8')

  const response = await fetch(`${supabaseUrl}/functions/v1/import-questions`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ csv, filename: name }),
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(body?.error ?? `HTTP ${response.status} ${response.statusText}`)
  }

  return body
}

console.log(`Nhập ${files.length} tệp từ ${samplesDir} vào ${supabaseUrl} …`)

let token
try {
  token = await signIn()
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
    const result = await importFile(name, token)

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
