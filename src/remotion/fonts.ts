import { loadFont as loadInter } from '@remotion/google-fonts/Inter'
import { loadFont as loadSpaceGrotesk } from '@remotion/google-fonts/SpaceGrotesk'

/**
 * Fonts for the video compositions.
 *
 * `@remotion/google-fonts` blocks rendering until the faces are ready, which
 * is what keeps a render deterministic. It is deliberately independent of the
 * `index.html` `<link>`: a composition has to look identical when it is
 * rendered headlessly, where that stylesheet is not part of the page.
 */

const display = loadSpaceGrotesk('normal', {
  weights: ['500', '600', '700'],
  subsets: ['latin', 'vietnamese'],
})

const body = loadInter('normal', {
  weights: ['400', '500', '600', '700'],
  subsets: ['latin', 'vietnamese'],
})

export const FONT_DISPLAY = display.fontFamily
export const FONT_BODY = body.fontFamily

export const waitForFonts = async () => {
  await Promise.all([display.waitUntilDone(), body.waitUntilDone()])
}
