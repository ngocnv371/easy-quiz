import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion'

import { COLORS } from './theme'

export const QUESTION_REVEAL_ID = 'EasyQuizQuestionReveal'
export const QUESTION_REVEAL_FPS = 30
export const QUESTION_REVEAL_WIDTH = 960
export const QUESTION_REVEAL_HEIGHT = 640
/** Long enough to read as a transition, short enough never to delay a player. */
export const QUESTION_REVEAL_DURATION = 22

/**
 * The reveal variants, in the order the player cycles through them. Adding a
 * name here and a branch in `QuestionReveal` is all a new variant needs.
 */
export const QUESTION_REVEAL_VARIANTS = [
  'sweep',
  'rows',
  'shutter',
  'ripple',
  'prism',
  'ink',
] as const

export type QuestionRevealVariant = (typeof QUESTION_REVEAL_VARIANTS)[number]

export type QuestionRevealProps = {
  variant: QuestionRevealVariant
  /** Hex colour taken from the question's topic accent. */
  accent: string
}

export const questionRevealDefaults: QuestionRevealProps = {
  variant: 'sweep',
  accent: COLORS.neon400,
}

/** Maps a topic accent name to the hex the composition should paint with. */
export function accentColor(accent: string | null | undefined): string {
  switch (accent) {
    case 'violet':
      return COLORS.violet400
    case 'magenta':
      return COLORS.magenta400
    case 'spark':
      return COLORS.spark400
    case 'lime':
      return COLORS.lime400
    default:
      return COLORS.neon400
  }
}

const CLAMP = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
} as const

const EASE = Easing.bezier(0.16, 1, 0.3, 1)

/**
 * The flourish played over the question card each time a new question arrives.
 *
 * It is deliberately abstract: it never draws the question's own text, so it can
 * be stretched to whatever size the card happens to be without a font or layout
 * mismatch. Every variant ends fully transparent, which leaves the real,
 * interactive question on screen — the composition decorates the change, it
 * never replaces the question.
 */
export function QuestionReveal({ variant, accent }: QuestionRevealProps) {
  const frame = useCurrentFrame()

  // The composition is transparent and stretched over the card; fading its top
  // and bottom edges keeps a variant from ending on a hard clipped line.
  const edgeFade = 'linear-gradient(180deg, transparent, #000 14%, #000 86%, transparent)'

  return (
    <AbsoluteFill
      style={{
        overflow: 'hidden',
        pointerEvents: 'none',
        maskImage: edgeFade,
        WebkitMaskImage: edgeFade,
      }}
    >
      {variant === 'sweep' ? <Sweep frame={frame} accent={accent} /> : null}
      {variant === 'rows' ? <Rows frame={frame} accent={accent} /> : null}
      {variant === 'shutter' ? <Shutter frame={frame} accent={accent} /> : null}
      {variant === 'ripple' ? <Ripple frame={frame} accent={accent} /> : null}
      {variant === 'prism' ? <Prism frame={frame} /> : null}
      {variant === 'ink' ? <Ink frame={frame} accent={accent} /> : null}
    </AbsoluteFill>
  )
}

// ── Variants ───────────────────────────────────────────────────────────────

/** A diagonal sheet of light rakes across, trailing a bright edge. */
function Sweep({ frame, accent }: { frame: number; accent: string }) {
  const travel = interpolate(frame, [0, 13], [-0.6, 1.15], { ...CLAMP, easing: EASE })
  const fade = interpolate(frame, [10, QUESTION_REVEAL_DURATION], [1, 0], CLAMP)
  const left = `${travel * 100}%`

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: '-40%',
          bottom: '-40%',
          left,
          width: '58%',
          transform: 'rotate(-14deg)',
          background: `linear-gradient(90deg, transparent, ${accent}44 30%, ${accent}e6 52%, ${accent}22 72%, transparent)`,
          filter: 'blur(3px)',
          opacity: fade,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '-40%',
          bottom: '-40%',
          left,
          width: 3,
          transform: 'rotate(-14deg)',
          background: '#ffffff',
          boxShadow: `0 0 26px 6px ${accent}`,
          opacity: fade * 0.9,
        }}
      />
    </>
  )
}

/**
 * The card assembles from its own skeleton: a prompt bar, then four option
 * bars, each wiping in from the left.
 */
function Rows({ frame, accent }: { frame: number; accent: string }) {
  const rows = [
    { top: '13%', width: '62%', height: 26 },
    { top: '42%', width: '90%', height: 46 },
    { top: '55%', width: '90%', height: 46 },
    { top: '68%', width: '90%', height: 46 },
    { top: '81%', width: '90%', height: 46 },
  ]

  return (
    <>
      {rows.map((row, index) => {
        const delay = index * 2.2
        const grow = interpolate(frame, [delay, delay + 9], [0, 1], {
          ...CLAMP,
          easing: EASE,
        })
        const fade = interpolate(
          frame,
          [13 + index, QUESTION_REVEAL_DURATION],
          [1, 0],
          CLAMP,
        )

        return (
          <div
            key={row.top}
            style={{
              position: 'absolute',
              top: row.top,
              left: '5%',
              width: row.width,
              height: row.height,
              borderRadius: 14,
              transform: `scaleX(${grow})`,
              transformOrigin: 'left center',
              borderLeft: `4px solid ${accent}`,
              background: `linear-gradient(90deg, ${accent}33, ${accent}0d 70%, transparent)`,
              opacity: fade,
            }}
          />
        )
      })}
    </>
  )
}

/** Six bands fold open like a camera shutter. */
function Shutter({ frame, accent }: { frame: number; accent: string }) {
  const bands = 6

  return (
    <>
      {Array.from({ length: bands }, (_, index) => {
        const delay = index * 1.4
        const open = interpolate(frame, [delay, delay + 8], [1, 0], {
          ...CLAMP,
          easing: EASE,
        })

        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${(index / bands) * 100}%`,
              height: `${100 / bands + 0.6}%`,
              transform: `scaleY(${open})`,
              transformOrigin: index % 2 === 0 ? 'top center' : 'bottom center',
              background: `linear-gradient(90deg, ${accent}2e, ${COLORS.ink900}66 55%, ${accent}2e)`,
              borderTop: `1px solid ${accent}55`,
              borderBottom: `1px solid ${accent}55`,
            }}
          />
        )
      })}
    </>
  )
}

/** Concentric rings push out from the centre, like a sonar ping. */
function Ripple({ frame, accent }: { frame: number; accent: string }) {
  const rings = 4

  return (
    <>
      {Array.from({ length: rings }, (_, index) => {
        const delay = index * 2.6
        const grow = interpolate(frame, [delay, QUESTION_REVEAL_DURATION], [0.1, 1.5], {
          ...CLAMP,
          easing: EASE,
        })
        const fade = interpolate(
          frame,
          [delay, delay + 6, QUESTION_REVEAL_DURATION],
          [0, 0.75, 0],
          CLAMP,
        )

        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: '62%',
              aspectRatio: '1 / 1',
              marginLeft: '-31%',
              marginTop: '-31%',
              borderRadius: '50%',
              border: `3px solid ${accent}`,
              transform: `scale(${grow})`,
              opacity: fade,
            }}
          />
        )
      })}
    </>
  )
}

/** Three brand-coloured slivers slide apart, splitting the light. */
function Prism({ frame }: { frame: number }) {
  const slivers = [COLORS.neon400, COLORS.violet400, COLORS.magenta400]
  const travel = interpolate(frame, [0, 12], [-0.25, 0.25], { ...CLAMP, easing: EASE })
  const fade = interpolate(frame, [8, QUESTION_REVEAL_DURATION], [1, 0], CLAMP)

  return (
    <>
      {slivers.map((color, index) => {
        const offset = travel * (index - 1) * 2

        return (
          <div
            key={color}
            style={{
              position: 'absolute',
              top: '-25%',
              bottom: '-25%',
              left: '50%',
              width: '22%',
              marginLeft: '-11%',
              transform: `translateX(${offset * 100}%) skewX(-16deg)`,
              background: `linear-gradient(180deg, transparent, ${color}cc 45%, transparent)`,
              mixBlendMode: 'screen',
              filter: 'blur(6px)',
              opacity: fade,
            }}
          />
        )
      })}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#ffffff',
          opacity: interpolate(frame, [5, 7, QUESTION_REVEAL_DURATION], [0, 0.28, 0], CLAMP),
        }}
      />
    </>
  )
}

/** Soft blobs bloom open and dissolve, echoing the aurora behind the page. */
function Ink({ frame, accent }: { frame: number; accent: string }) {
  const blobs = [
    { color: accent, left: '32%', top: '44%' },
    { color: COLORS.violet400, left: '64%', top: '38%' },
    { color: COLORS.magenta400, left: '48%', top: '66%' },
    { color: COLORS.spark400, left: '58%', top: '52%' },
  ]

  return (
    <>
      {blobs.map((blob, index) => {
        const delay = index * 1.8
        const grow = interpolate(frame, [delay, delay + 12], [0.2, 1.25], {
          ...CLAMP,
          easing: EASE,
        })
        const fade = interpolate(
          frame,
          [delay, delay + 5, QUESTION_REVEAL_DURATION],
          [0, 0.42, 0],
          CLAMP,
        )

        return (
          <div
            key={blob.color}
            style={{
              position: 'absolute',
              left: blob.left,
              top: blob.top,
              width: '38%',
              aspectRatio: '1 / 1',
              marginLeft: '-19%',
              marginTop: '-19%',
              borderRadius: '50%',
              backgroundColor: blob.color,
              filter: 'blur(52px)',
              transform: `scale(${grow})`,
              opacity: fade,
            }}
          />
        )
      })}
    </>
  )
}
