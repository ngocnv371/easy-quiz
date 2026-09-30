#!/usr/bin/env node
/**
 * Regenerates `src/lib/database.types.ts` from the local Supabase schema.
 *
 * A shell redirect (`supabase gen types ... > file`) is not portable: on
 * Windows PowerShell it can emit UTF-16, which TypeScript then refuses to
 * parse. This writes UTF-8 explicitly and re-attaches the "generated" banner
 * that the CLI output does not include.
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(projectRoot, 'src/lib/database.types.ts')

const HEADER = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Produced by \`npm run types:gen\`, which runs
 * \`supabase gen types typescript --local\` against the migrations in
 * \`supabase/migrations\`. Change the schema there, then regenerate.
 *
 * Note that every view column is typed nullable: PostgreSQL does not record
 * NOT NULL on views. \`src/lib/domain.ts\` re-narrows those rows into the shapes
 * the UI actually consumes, and is where the null handling lives.
 */

`

let output
try {
  output = execFileSync(
    'supabase',
    ['gen', 'types', 'typescript', '--local'],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  )
} catch (error) {
  console.error(
    '\nKhông sinh được types. Hãy chắc chắn Supabase local đang chạy:\n' +
      '  npm run supabase:start\n',
  )
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

if (!output.includes('export type Database')) {
  console.error('Đầu ra của Supabase CLI không như mong đợi; giữ nguyên file cũ.')
  process.exit(1)
}

writeFileSync(target, HEADER + output, 'utf8')
console.log(`Đã ghi ${target}`)
