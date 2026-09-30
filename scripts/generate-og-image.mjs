#!/usr/bin/env node
/**
 * Renders `scripts/og-image.html` to `public/og-image.png`, the 1200×630 card
 * that link previews on Facebook, Zalo, X and Discord show.
 *
 * The HTML is the editable source; this only shells out to Playwright's
 * screenshot CLI so the render is reproducible instead of a hand-cropped
 * screen grab. Playwright is not a project dependency — `npx` fetches it on
 * first use, and Chromium has to be installed once:
 *
 *   npx playwright install chromium
 *
 * Re-run this whenever the card's copy or design changes; the file is served
 * straight from `public/` and is not part of the build.
 */

import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(projectRoot, 'scripts/og-image.html')
const target = resolve(projectRoot, 'public/og-image.png')

try {
  execFileSync(
    'npx',
    [
      '--yes',
      'playwright',
      'screenshot',
      // The card is a fixed-size document, so the viewport *is* the crop.
      '--viewport-size=1200,630',
      '--wait-for-timeout=1500',
      pathToFileURL(source).href,
      target,
    ],
    { cwd: projectRoot, stdio: 'inherit', shell: process.platform === 'win32' },
  )
} catch (error) {
  console.error('\nKhông render được ảnh chia sẻ. Nếu Playwright thiếu trình duyệt:')
  console.error('  npx playwright install chromium\n')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

console.log('Đã ghi public/og-image.png (1200×630).')
