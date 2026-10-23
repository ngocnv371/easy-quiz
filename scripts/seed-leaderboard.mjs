// Fills the leaderboards with made-up players, so a fresh site doesn't open on empty boards. Each
// player gets a profile, quiz attempts on the published public quizzes and a few Endless runs, all
// written straight into D1 like admin:promote does. Every row hangs off a user id that starts with
// `seed-` (email @seed.easyquiz.invalid, no password, so nobody can sign in as one), which is how
// --clean finds them again. Seeding cleans first, so running it twice doesn't double up.
//
//   npm run seed:leaderboard                     # 40 players into the local D1 (npm run dev)
//   npm run seed:leaderboard -- --players 80
//   npm run seed:leaderboard -- --remote         # the real database
//   npm run seed:leaderboard -- --clean          # remove every seeded player (add --remote too)
//
// Import quizzes first (npm run import:samples): attempts need published public quizzes to land on.
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const args = process.argv.slice(2)
const remote = args.includes('--remote')
const clean = args.includes('--clean')
const playersAt = args.indexOf('--players')
const playerCount = playersAt >= 0 ? Number.parseInt(args[playersAt + 1] ?? '', 10) : 40

if (!Number.isFinite(playerCount) || playerCount < 1 || playerCount > 500) {
  console.error('Cách dùng: npm run seed:leaderboard -- [--players <1–500>] [--clean] [--remote]')
  process.exit(1)
}

// wrangler's own entry point, run with this node: no npx, so no shell to split arguments apart
const wrangler = join(dirname(createRequire(import.meta.url).resolve('wrangler/package.json')), 'bin', 'wrangler.js')

// With --json, wrangler still prints upload progress first on --remote; the JSON starts at the first
// line that opens an array or object.
const parseOutput = (out) => JSON.parse(out.slice(out.search(/^[[{]/m)))

// Runs SQL through wrangler; exits on a database error. A read (one statement) goes as --command and
// returns its rows; a write goes as a file, since a remote --file run only reports a summary.
function d1(sql, { read = false } = {}) {
  const dir = read ? null : mkdtempSync(join(tmpdir(), 'easy-quiz-'))
  const source = read ? ['--command', sql.replace(/\s+/g, ' ').trim()] : ['--file', join(dir, 'seed.sql')]
  if (dir) writeFileSync(source[1], sql)
  try {
    const out = execFileSync(
      process.execPath,
      [wrangler, 'd1', 'execute', 'DB', remote ? '--remote' : '--local', ...source, '--yes', '--json'],
      { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
    return parseOutput(out).at(-1)?.results ?? []
  } catch (error) {
    // with --json, wrangler puts the database's complaint on stdout
    const text = (() => {
      try {
        return parseOutput(error.stdout).error?.text
      } catch {
        return null
      }
    })()
    console.error(`D1 báo lỗi: ${text ?? error.message}`)
    if (dir) rmSync(dir, { recursive: true, force: true })
    if (text?.includes('no such table')) console.error('Cơ sở dữ liệu chưa có bảng — chạy npm run db:migrate trước.')
    process.exit(1)
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
}

// Removes every seeded row. Attempts only lose their player when a profile goes (on delete set
// null), so they are deleted by hand, after taking their plays back off the quizzes' counters.
const CLEAN_SQL = `update quizzes set play_count = max(play_count - (select count(*) from attempts a
    where a.quiz_id = quizzes.id and a.user_id like 'seed-%'), 0)
  where id in (select quiz_id from attempts where user_id like 'seed-%');
delete from attempts where user_id like 'seed-%';
delete from endless_progress where user_id like 'seed-%';
delete from endless_sessions where user_id like 'seed-%';
delete from profiles where id like 'seed-%';
delete from user where id like 'seed-%';
`

if (clean) {
  console.log(`Xoá người chơi mẫu khỏi D1 ${remote ? 'thật (--remote)' : 'cục bộ'} …`)
  d1(CLEAN_SQL)
  console.log('Xong.')
  process.exit(0)
}

// ---------------------------------------------------------------- what there is to play

const quizzes = d1(`select q.id, q.topic_id, q.time_limit_seconds, count(qu.id) as question_count,
    coalesce(sum(qu.points), 0) as max_score
  from quizzes q join questions qu on qu.quiz_id = q.id
  where q.status = 'published' and q.visibility = 'public'
  group by q.id having max_score > 0`, { read: true })

if (quizzes.length === 0) {
  console.error('Chưa có đề nào được xuất bản công khai — nhập câu hỏi trước (npm run import:samples).')
  process.exit(1)
}

const topicIds = [...new Set(quizzes.map((q) => q.topic_id).filter(Boolean))]

// ---------------------------------------------------------------- made-up players

const GIVEN = [
  'Minh Anh', 'Bảo Ngọc', 'Gia Huy', 'Khánh Linh', 'Đức Minh', 'Thảo Vy', 'Hoàng Nam', 'Ngọc Hân', 'Quốc Bảo',
  'Phương Thảo', 'Tuấn Kiệt', 'Mai Anh', 'Đăng Khoa', 'Hà My', 'Minh Khang', 'Thu Trang', 'Nhật Minh', 'Yến Nhi',
  'Anh Thư', 'Trung Kiên', 'Bảo Anh', 'Thanh Tâm', 'Hải Đăng', 'Diệu Linh', 'Phúc An', 'Tường Vi', 'Minh Quân',
  'Khả Hân', 'Gia Bảo', 'Thùy Dương', 'Hữu Phước', 'Lan Chi', 'Quang Vinh', 'Ngọc Diệp', 'Thiên Ân', 'Kim Ngân',
]
const AVATARS = ['🎓', '🦊', '🐼', '🐨', '🦉', '🐙', '🦄', '🐝', '🦁', '🐬', '🦖', '🐳', '🌟', '🔥', '🌈', '⚡', '🍀', '🎈']

const pick = (list) => list[Math.floor(Math.random() * list.length)]
const between = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1))
// strip Vietnamese marks for usernames: "Đức Minh" -> "ducminh"
const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
const q = (v) => (v === null ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)

// a time in the last `days` days, weighted toward now
const ago = (days) => new Date(Date.now() - Math.random() ** 2 * days * 86_400_000).toISOString()
// how many correct out of n for a player who gets each one right with chance p
const binomial = (n, p) => Array.from({ length: n }, () => Math.random() < p).filter(Boolean).length

// a few quizzes everybody plays, so the per-quiz boards have more than one name on them
const favourites = [...quizzes].sort(() => Math.random() - 0.5).slice(0, Math.min(8, quizzes.length))
const someQuiz = () => (Math.random() < 0.6 ? pick(favourites) : pick(quizzes))

const statements = []
const counts = { players: 0, attempts: 0, runs: 0 }
const plays = new Map()

for (let i = 0; i < playerCount; i += 1) {
  const id = `seed-${randomUUID()}`
  const guest = Math.random() < 0.2
  const given = pick(GIVEN)
  // a few go by a handle, the way kids name themselves: "minhanh2013"
  const handle = !guest && Math.random() < 0.25
  const display = guest
    ? `Khách ${String(between(1, 9999)).padStart(4, '0')}`
    : handle
      ? `${ascii(given).replace(/ /g, '').toLowerCase()}${between(2010, 2018)}`
      : given
  const username = `${ascii(guest ? 'khach' : given).replace(/[^a-zA-Z0-9]+/g, '').toLowerCase()}_${id.slice(5, 10)}`
  const joined = ago(60)
  // how good this player is: most are decent, a few are very good
  const skill = 0.45 + 0.5 * Math.random() ** 0.7

  statements.push(
    `insert into user (id, name, email, emailVerified, createdAt, updatedAt, isAnonymous)
      values (${q(id)}, ${q(display)}, ${q(`${id}@seed.easyquiz.invalid`)}, 0, ${q(joined)}, ${q(joined)}, ${guest ? 1 : 0});`,
    `insert into profiles (id, username, display_name, avatar_emoji, is_guest, created_at, updated_at)
      values (${q(id)}, ${q(username)}, ${q(display)}, ${q(pick(AVATARS))}, ${guest ? 1 : 0}, ${q(joined)}, ${q(joined)});`,
  )
  counts.players += 1

  // quiz attempts: a handful for most, a lot for the keen ones
  const attempts = Math.max(1, Math.round(1 + 24 * Math.random() ** 2.5))
  for (let a = 0; a < attempts; a += 1) {
    const quiz = someQuiz()
    const n = quiz.question_count
    const correct = binomial(n, skill)
    const score = Math.round((quiz.max_score * correct) / n)
    const accuracy = Math.round((score / quiz.max_score) * 10000) / 100
    let duration = Math.round(n * (4 + 14 * (1.1 - skill) * Math.random() + 3))
    if (quiz.time_limit_seconds > 0) duration = Math.min(duration, quiz.time_limit_seconds)
    statements.push(
      `insert into attempts (id, quiz_id, user_id, score, max_score, correct_count, question_count, accuracy, duration_seconds, completed_at)
        values (${q(randomUUID())}, ${q(quiz.id)}, ${q(id)}, ${score}, ${quiz.max_score}, ${correct}, ${n}, ${accuracy}, ${duration}, ${q(ago(30))});`,
    )
    plays.set(quiz.id, (plays.get(quiz.id) ?? 0) + 1)
    counts.attempts += 1
  }

  // Endless runs, for most players: a run ends at the first miss after its best streak
  if (Math.random() < 0.75) {
    const progress = new Map()
    for (let r = between(1, 8); r > 0; r -= 1) {
      let streak = 0
      while (Math.random() < skill && streak < 80) streak += 1
      const extra = between(0, 15)
      const answered = streak + 1 + extra
      const right = streak + binomial(extra, skill)
      const topic = Math.random() < 0.3 || topicIds.length === 0 ? null : pick(topicIds)
      const started = ago(30)
      const updated = new Date(Date.parse(started) + answered * between(5, 12) * 1000).toISOString()
      statements.push(
        `insert into endless_sessions (id, user_id, topic_id, answered, correct, current_streak, best_streak, started_at, updated_at)
          values (${q(randomUUID())}, ${q(id)}, ${q(topic)}, ${answered}, ${right}, 0, ${streak}, ${q(started)}, ${q(updated)});`,
      )
      counts.runs += 1
      const key = topic ?? pick(topicIds)
      if (key) {
        const seen = progress.get(key) ?? { answered: 0, correct: 0 }
        progress.set(key, { answered: seen.answered + answered, correct: seen.correct + right })
      }
    }
    for (const [topic, p] of progress) {
      statements.push(
        `insert into endless_progress (user_id, topic_id, answered, correct) values (${q(id)}, ${q(topic)}, ${p.answered}, ${p.correct});`,
      )
    }
  }
}

for (const [quizId, n] of plays) statements.push(`update quizzes set play_count = play_count + ${n} where id = ${q(quizId)};`)

console.log(`Gieo ${counts.players} người chơi mẫu vào D1 ${remote ? 'thật (--remote)' : 'cục bộ'} …`)
d1(`${CLEAN_SQL}\n${statements.join('\n')}\n`)
console.log(`Xong: ${counts.players} người chơi · ${counts.attempts} lượt làm đề · ${counts.runs} lượt Endless.`)
console.log('Gỡ bỏ: npm run seed:leaderboard -- --clean' + (remote ? ' --remote' : ''))
