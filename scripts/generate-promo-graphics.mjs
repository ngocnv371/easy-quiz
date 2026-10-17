#!/usr/bin/env node
/**
 * Renders `scripts/promo-graphics.html` into the 10-square Facebook launch
 * series, in Vietnamese and English (1080×1080 each).
 *
 *   npm run promo:graphics
 *
 * Output:
 *   promo/vi/easy-quiz-promo-01.png … -10.png
 *   promo/en/easy-quiz-promo-01.png … -10.png
 *
 * Uses Playwright's screenshot CLI, like `generate-og-image.mjs`. Playwright is
 * not a project dependency; `npx` fetches it and Chromium must be installed
 * once:
 *
 *   npx playwright install chromium
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(projectRoot, 'scripts/promo-graphics.html')
const cardCount = 10
const languages = ['vi', 'en']

/** cmd.exe needs the file URL quoted so `?` and `-` stay in one argument. */
const arg = (value) => (process.platform === 'win32' ? `"${value}"` : value)

for (const lang of languages) {
  const outDir = resolve(projectRoot, 'promo', lang)
  mkdirSync(outDir, { recursive: true })

  for (let index = 1; index <= cardCount; index += 1) {
    const number = String(index).padStart(2, '0')
    const target = resolve(outDir, `easy-quiz-promo-${number}.png`)
    const url = `${pathToFileURL(source).href}?card=${index}-${lang}`

    execFileSync(
      'npx',
      [
        '--yes',
        'playwright',
        'screenshot',
        // The card is a fixed-size document, so the viewport *is* the crop.
        '--viewport-size=1080,1080',
        '--wait-for-timeout=2000',
        arg(url),
        arg(target),
      ],
      { cwd: projectRoot, stdio: 'inherit', shell: process.platform === 'win32' },
    )

    console.log(`✓ ${lang.toUpperCase()} ${number}/10 → ${target}`)
  }
}

console.log('\nĐã render 20 ảnh promo (10 VI + 10 EN) vào promo/.')
console.log('Rendered 20 promo graphics (10 VI + 10 EN) into promo/.')
