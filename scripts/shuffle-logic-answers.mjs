// Build an importable question CSV from raw part files.
//
// Raw parts are authored with the correct answer always in `option_a` so the
// content is easy to review without tracking letters. This script shuffles the
// four options per row with a seeded PRNG and recomputes the `correct` letter,
// so the finished bank has no answer-position bias. Re-running is deterministic.
//
//   node scripts/shuffle-logic-answers.mjs <out.csv> <in1.csv> <in2.csv> ...

import fs from 'node:fs'

const HEADER = 'subject,prompt,option_a,option_b,option_c,option_d,correct,explanation'

/** Deterministic PRNG so a rebuild reproduces the exact same files. */
function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** RFC-4180 line parser: quoted fields, escaped quotes, commas inside quotes. */
function parseLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

function quote(field) {
  return /[",\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field
}

const [out, ...inputs] = process.argv.slice(2)
if (!out || inputs.length === 0) {
  console.error('usage: node scripts/shuffle-logic-answers.mjs <out.csv> <in...csv>')
  process.exit(1)
}

const rand = mulberry32(20261016)
const lines = []

for (const input of inputs) {
  const text = fs.readFileSync(input, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    if (/^subject,/i.test(line)) continue

    const fields = parseLine(line)
    if (fields.length < 8) {
      console.error(`skipping malformed row in ${input}: ${line}`)
      continue
    }

    const [subject, prompt, a, b, c, d, , explanation] = fields
    const options = [a, b, c, d]

    const order = [0, 1, 2, 3]
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }

    const shuffled = order.map((i) => options[i])
    const correct = 'ABCD'[order.indexOf(0)]
    lines.push([subject, prompt, ...shuffled, correct, explanation].map(quote).join(','))
  }
}

fs.writeFileSync(out, `${HEADER}\n${lines.join('\n')}\n`, 'utf8')
console.log(`wrote ${out} — ${lines.length} questions`)
