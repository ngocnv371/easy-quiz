import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

import { COLORS } from './theme'

export const QUESTION_REVEAL_ID = 'EasyQuizQuestionReveal'
export const QUESTION_REVEAL_FPS = 30
export const QUESTION_REVEAL_WIDTH = 960
export const QUESTION_REVEAL_HEIGHT = 640
/** A short beat between questions: long enough to register, quick enough not to stall. */
export const QUESTION_REVEAL_DURATION = 22

export type QuestionRevealProps = {
  /** Hex colour taken from the question's topic accent. */
  accent: string
  /** The running question number this beat announces. */
  index: number
}

export const questionRevealDefaults: QuestionRevealProps = {
  accent: COLORS.neon400,
  index: 1,
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
 * The last frame the player actually renders. `durationInFrames` is a count, so
 * frames run 0…DURATION−1; a fade ending at `DURATION` never quite reaches zero.
 */
const LAST_FRAME = QUESTION_REVEAL_DURATION - 1

const RING_SIZE = 300
const RING_RADIUS = 100
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/**
 * A twist on the quiz intro, played once per question.
 *
 * The countdown's ring returns, but instead of counting 3-2-1 down, it draws
 * around the running question number and bursts outward. It is an accent, not
 * the main event — the real prompt words and answer tiles animate themselves
 * (see `question-motion.ts`) — so it never covers the card's reading area.
 */
export function QuestionReveal({ accent, index }: QuestionRevealProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Belt and braces: the whole layer is gone before the final frame.
  const settle = interpolate(frame, [LAST_FRAME - 5, LAST_FRAME], [1, 0], CLAMP)

  const draw = interpolate(frame, [0, 11], [0, 1], { ...CLAMP, easing: EASE })
  const burst = interpolate(frame, [13, LAST_FRAME], [0, 1], { ...CLAMP, easing: EASE })

  const numberIn = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 220 },
    durationInFrames: 12,
  })

  const contentOpacity = interpolate(frame, [0, 3, 14, LAST_FRAME], [0, 1, 1, 0], CLAMP)
  const numberScale = (0.55 + numberIn * 0.45) * (1 + burst * 0.85)

  const ringOpacity = interpolate(frame, [0, 3, 14, LAST_FRAME], [0, 1, 1, 0], CLAMP)
  const ringScale = 1 + burst * 0.85

  // The tick marks around the ring: they hold, then fly apart with the burst.
  const tickOpacity = interpolate(frame, [0, 4, 14, LAST_FRAME], [0, 0.85, 0.85, 0], CLAMP)
  const tickRadius = 74 + burst * 96
  const spin = interpolate(frame, [0, LAST_FRAME], [-30, 70], CLAMP)

  const glowOpacity = interpolate(frame, [0, 5, 16, LAST_FRAME], [0, 0.5, 0.32, 0], CLAMP)
  const glowScale = 0.55 + draw * 0.45 + burst * 0.6

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: settle, overflow: 'hidden' }}>
      {/* Centred in the question area. The card is held invisible while this
          plays, so the beat reads as an intro rather than an overlay. */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: RING_SIZE,
          height: RING_SIZE,
          marginLeft: -RING_SIZE / 2,
          marginTop: -RING_SIZE / 2,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 280,
            height: 280,
            marginLeft: -140,
            marginTop: -140,
            borderRadius: '50%',
            backgroundColor: accent,
            filter: 'blur(78px)',
            opacity: glowOpacity,
            transform: `scale(${glowScale})`,
          }}
        />

        {Array.from({ length: 12 }, (_, mark) => (
          <div
            key={mark}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 3,
              height: 14,
              marginLeft: -1.5,
              marginTop: -7,
              borderRadius: 2,
              backgroundColor: accent,
              opacity: tickOpacity,
              transform: `rotate(${mark * 30 + spin}deg) translateY(-${tickRadius}px)`,
            }}
          />
        ))}

        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `rotate(-90deg) scale(${ringScale})`,
            transformOrigin: 'center',
            opacity: ringOpacity,
          }}
          aria-hidden
        >
          <defs>
            <linearGradient id="question-intro-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={COLORS.neon300} />
              <stop offset="55%" stopColor={COLORS.violet400} />
              <stop offset="100%" stopColor={accent} />
            </linearGradient>
          </defs>
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={COLORS.ink700}
            strokeWidth={8}
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="url(#question-intro-ring)"
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - draw)}
          />
        </svg>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: contentOpacity,
            transform: `scale(${numberScale})`,
          }}
        >
          <span
            style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 15,
              letterSpacing: '0.44em',
              marginLeft: '0.44em',
              color: COLORS.ink300,
            }}
          >
            CÂU
          </span>
          <span
            style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 92,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: '-0.04em',
              color: COLORS.ink50,
              textShadow: `0 0 36px ${accent}`,
            }}
          >
            {index}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  )
}
