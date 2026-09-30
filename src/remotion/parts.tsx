import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

import { COLORS, EASE_OUT, GRADIENT_BRAND } from './theme'

/**
 * Reusable pieces for the Easy Quiz compositions.
 *
 * Everything here derives its values from `useCurrentFrame()`. No CSS
 * transitions, no animation classes — those do not exist when the composition
 * is rendered outside the app.
 */

// ── Ambient background ─────────────────────────────────────────────────────
export function Backdrop({
  intensity = 1,
  withSpark = true,
}: {
  intensity?: number
  withSpark?: boolean
}) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  // Driven by absolute time so the drift loops exactly with the composition.
  const seconds = frame / fps
  const cycle = durationInFrames / fps

  const drift = (offset: number) => ({
    x: Math.sin(((seconds + offset) / cycle) * Math.PI * 2) * 42,
    y: Math.cos(((seconds + offset) / cycle) * Math.PI * 2) * 30,
  })

  const orb = (
    color: string,
    size: number,
    left: string,
    top: string,
    offset: number,
    opacity: number,
  ): CSSProperties => {
    const d = drift(offset)
    return {
      position: 'absolute',
      left,
      top,
      width: size,
      height: size,
      marginLeft: -size / 2,
      marginTop: -size / 2,
      borderRadius: '50%',
      backgroundColor: color,
      opacity: opacity * intensity,
      filter: 'blur(130px)',
      transform: `translate3d(${d.x}px, ${d.y}px, 0)`,
    }
  }

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink950 }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(to right, ${COLORS.ink500}33 1px, transparent 1px), linear-gradient(to bottom, ${COLORS.ink500}33 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
          opacity: 0.5,
          maskImage: 'radial-gradient(ellipse at center, black 10%, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 10%, transparent 72%)',
        }}
      />

      <div style={orb(COLORS.neon400, 620, '50%', '-8%', 0, 0.22)} />
      <div style={orb(COLORS.violet600, 540, '18%', '108%', 0.3, 0.28)} />
      <div style={orb(COLORS.magenta400, 480, '88%', '42%', 0.6, 0.14)} />
      {withSpark ? <div style={orb(COLORS.spark400, 380, '34%', '18%', 0.8, 0.16)} /> : null}
    </AbsoluteFill>
  )
}

// ── Brand mark ─────────────────────────────────────────────────────────────
export function LogoMark({ size = 56, spark = true }: { size?: number; spark?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden>
      <defs>
        <linearGradient id="remotion-eq-mark" x1="0" y1="4" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={COLORS.neon300} />
          <stop offset="55%" stopColor={COLORS.violet400} />
          <stop offset="100%" stopColor={COLORS.magenta400} />
        </linearGradient>
      </defs>
      <g
        stroke="url(#remotion-eq-mark)"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3.6" y="4.2" width="16.8" height="16.4" rx="5.2" />
        <path d="M9.55 10.4a2.6 2.6 0 0 1 5.06.83c0 1.75-2.45 2.1-2.45 3.72" />
      </g>
      <circle cx="12.16" cy="17.4" r="1.12" fill={COLORS.spark400} />
      {spark ? (
        <path
          d="M19.1 1.5l.62 1.53 1.53.62-1.53.62-.62 1.53-.62-1.53-1.53-.62 1.53-.62z"
          fill={COLORS.spark400}
        />
      ) : null}
    </svg>
  )
}

// ── Surfaces ───────────────────────────────────────────────────────────────
export const panelStyle: CSSProperties = {
  background: `linear-gradient(145deg, ${COLORS.ink800}f2 0%, ${COLORS.ink900}e6 100%)`,
  border: `1px solid ${COLORS.ink600}b3`,
  borderRadius: 24,
  boxShadow: '0 40px 90px -40px rgba(0,0,0,0.95)',
}

export function Chip({
  children,
  tone = 'neon',
}: {
  children: ReactNode
  tone?: 'neon' | 'spark' | 'correct' | 'neutral'
}) {
  const tones = {
    neon: { border: `${COLORS.neon400}66`, color: COLORS.neon300, background: `${COLORS.neon400}14` },
    spark: { border: `${COLORS.spark400}66`, color: COLORS.spark300, background: `${COLORS.spark400}14` },
    correct: {
      border: `${COLORS.correct400}66`,
      color: COLORS.correct300,
      background: `${COLORS.correct500}1f`,
    },
    neutral: { border: `${COLORS.ink600}`, color: COLORS.ink200, background: `${COLORS.ink800}cc` },
  } as const

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 16px',
        borderRadius: 999,
        border: `1px solid ${tones[tone].border}`,
        backgroundColor: tones[tone].background,
        color: tones[tone].color,
        fontSize: 17,
        fontWeight: 600,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

// ── Motion helpers ─────────────────────────────────────────────────────────
/** A spring that starts at `delay` and settles smoothly. */
export function useEnter(delay: number, durationInFrames = 26) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  return spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 200, stiffness: 120 },
    durationInFrames,
  })
}

/** A bouncier spring for playful entrances. */
export function usePop(delay: number, durationInFrames = 28) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  return spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 12, stiffness: 180, mass: 0.9 },
    durationInFrames,
  })
}

export function useFade(from: number, to: number) {
  const frame = useCurrentFrame()
  return interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE_OUT,
  })
}

// ── Celebration ────────────────────────────────────────────────────────────
const CONFETTI_COLORS = [
  COLORS.spark400,
  COLORS.neon400,
  COLORS.violet400,
  COLORS.magenta400,
  COLORS.correct400,
]

/**
 * A radial burst of small tiles. Angles and distances are derived from the
 * index, so a burst is identical on every render of the same frame.
 */
export function Confetti({
  start,
  count = 34,
  originX = '50%',
  originY = '50%',
  spread = 1,
}: {
  start: number
  count?: number
  originX?: string
  originY?: string
  spread?: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const elapsed = frame - start

  if (elapsed < 0) return null

  return (
    <div style={{ position: 'absolute', left: originX, top: originY, width: 0, height: 0 }}>
      {Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2 + (index % 3) * 0.14
        const distance = (120 + (index % 7) * 34) * spread
        const size = 9 + (index % 4) * 4
        const life = 1.15 + (index % 5) * 0.16

        // Each tile travels out along its own ray and fades as it slows.
        const progress = interpolate(elapsed, [0, life * fps], [0, 1], {
          extrapolateRight: 'clamp',
          easing: EASE_OUT,
        })
        const opacity = interpolate(elapsed, [0, life * fps * 0.75, life * fps], [0, 1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
        const fall = interpolate(elapsed, [0, life * fps], [0, 150], {
          extrapolateRight: 'clamp',
        })

        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              width: size,
              height: size * 0.62,
              borderRadius: 3,
              backgroundColor: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
              opacity,
              transform: `translate3d(${Math.cos(angle) * distance * progress}px, ${Math.sin(angle) * distance * progress + fall}px, 0) rotate(${index * 37 + progress * 320}deg)`,
            }}
          />
        )
      })}
    </div>
  )
}

// ── Radial gauge ───────────────────────────────────────────────────────────
export function Gauge({
  size,
  strokeWidth = 14,
  progress,
  tone = 'brand',
  children,
}: {
  size: number
  strokeWidth?: number
  /** 0–1. */
  progress: number
  tone?: 'brand' | 'spark' | 'correct'
  children?: ReactNode
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(1, progress))

  const gradientId = `remotion-gauge-${tone}`
  const stops =
    tone === 'spark'
      ? [COLORS.spark300, COLORS.magenta400]
      : tone === 'correct'
        ? [COLORS.correct300, COLORS.neon400]
        : [COLORS.neon400, COLORS.violet400, COLORS.magenta400]

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            {stops.map((color, index) => (
              <stop
                key={color}
                offset={`${(index / Math.max(1, stops.length - 1)) * 100}%`}
                stopColor={color}
              />
            ))}
          </linearGradient>
        </defs>

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={COLORS.ink700}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
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
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** The brand gradient as a text fill. */
export const gradientText: CSSProperties = {
  backgroundImage: GRADIENT_BRAND,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
}
