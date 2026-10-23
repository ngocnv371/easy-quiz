// Makes an account an admin (admins author quizzes, import CSVs and use AI Assist). Admin is never
// self-serve; this is the one way in. The account must exist (signed up) first.
//
//   npm run admin:promote -- someone@example.com            # local D1 (npm run dev)
//   npm run admin:promote -- someone@example.com --remote   # the real database
//   npm run admin:promote -- someone@example.com --credits 50   # also grant AI Assist credits
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const email = args.find((a) => a.includes('@'))
const remote = args.includes('--remote')
const creditsAt = args.indexOf('--credits')
const credits = creditsAt >= 0 ? Number.parseInt(args[creditsAt + 1] ?? '', 10) : 0

if (!email || !/^[^\s@'"]+@[^\s@'"]+$/.test(email) || !Number.isFinite(credits) || credits < 0) {
  console.error('Cách dùng: npm run admin:promote -- <email> [--remote] [--credits <số>]')
  process.exit(1)
}

const sql = `update profiles set role = 'admin', ai_credits = ai_credits + ${credits}
  where id = (select id from user where lower(email) = lower('${email}'));
`

// as a file: on Windows npx needs a shell, which would split a --command argument apart
const dir = mkdtempSync(join(tmpdir(), 'easy-quiz-'))
const file = join(dir, 'promote.sql')
writeFileSync(file, sql)
try {
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', remote ? '--remote' : '--local', '--file', file, '--yes'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
} finally {
  rmSync(dir, { recursive: true, force: true })
}
