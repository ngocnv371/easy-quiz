/**
 * Design tokens for the video compositions.
 *
 * These mirror the CSS custom properties in `src/styles/globals.css`. They are
 * repeated here on purpose: a Remotion composition must render correctly on a
 * bare page with no stylesheet, so it cannot rely on Tailwind utilities or CSS
 * variables being present.
 */

export const COLORS = {
  ink950: '#04060f',
  ink900: '#080b18',
  ink800: '#0d1224',
  ink700: '#171d32',
  ink600: '#262e49',
  ink500: '#3c4665',
  ink400: '#5a658a',
  ink300: '#7d88a8',
  ink200: '#a9b2cc',
  ink100: '#d5daea',
  ink50: '#eef1f8',

  neon300: '#67e8f9',
  neon400: '#22d3ee',
  neon600: '#0891b2',

  violet300: '#c4b5fd',
  violet400: '#a78bfa',
  violet600: '#7c3aed',

  magenta400: '#f472b6',

  spark300: '#fcd34d',
  spark400: '#fbbf24',

  correct300: '#6ee7b7',
  correct400: '#34d399',
  correct500: '#10b981',

  wrong400: '#fb7185',
} as const

export const GRADIENT_BRAND = `linear-gradient(100deg, ${COLORS.neon300} 0%, ${COLORS.violet400} 55%, ${COLORS.magenta400} 100%)`

export const GRADIENT_SPARK = `linear-gradient(100deg, ${COLORS.spark300} 0%, ${COLORS.magenta400} 100%)`

import { Easing } from 'remotion'

/**
 * Easing curve matching `EASE` in `src/lib/motion.ts`, so a DOM reveal and a
 * video reveal feel like the same motion language.
 *
 * Remotion's `interpolate` wants an easing function, not a cubic-bezier tuple.
 */
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1)
