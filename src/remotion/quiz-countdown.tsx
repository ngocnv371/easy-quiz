import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

import { Backdrop, Chip, LogoMark } from './parts'
import { COLORS, GRADIENT_SPARK } from './theme'

export const QUIZ_INTRO_ID = 'EasyQuizCountdown'
export const QUIZ_INTRO_FPS = 30
export const QUIZ_INTRO_WIDTH = 1200
export const QUIZ_INTRO_HEIGHT = 640
/** Three counts, then the starting pistol. */
export const QUIZ_INTRO_DURATION = 3 * QUIZ_INTRO_FPS + 42

export type QuizIntroProps = {
  title: string
  questionCount: number
  topicName: string | null
  seconds: number
}

export const quizIntroDefaults: QuizIntroProps = {
  title: 'Toán lớp 6 · Số tự nhiên',
  questionCount: 5,
  topicName: 'Toán học',
  seconds: 3,
}

/**
 * The countdown played before a quiz starts.
 *
 * Three beats, one per second, each a spring-pop number inside a sweeping
 * ring — then a bright "BẮT ĐẦU!" flash that hands over to the player.
 */
export function QuizIntro({
  title,
  questionCount,
  topicName,
  seconds,
}: QuizIntroProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const countdownFrames = seconds * fps
  const outroAt = countdownFrames

  const goIn = spring({
    frame: Math.max(0, frame - outroAt),
    fps,
    config: { damping: 14, stiffness: 200 },
    durationInFrames: 18,
  })

  // A single white flash right as the count ends.
  const flash = interpolate(frame, [outroAt - 3, outroAt + 6, outroAt + 20], [0, 0.5, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const headerIn = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 26,
  })

  const contentOpacity = interpolate(frame, [outroAt, outroAt + 12], [1, 0.25], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill>
      <Backdrop withSpark />

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 26,
        }}
      >
        {/* ── Quiz identity ────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            opacity: headerIn * contentOpacity,
            transform: `translateY(${(1 - headerIn) * 18}px)`,
          }}
        >
          <LogoMark size={40} />
          <span
            style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 26,
              fontWeight: 600,
              color: COLORS.ink50,
            }}
          >
            {title}
          </span>
          {topicName ? <Chip tone="neon">{topicName}</Chip> : null}
          <Chip tone="neutral">{questionCount} câu hỏi</Chip>
        </div>

        {/* ── The numbers ──────────────────────────────────────────── */}
        <div
          style={{
            position: 'relative',
            width: 300,
            height: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: contentOpacity,
          }}
        >
          {Array.from({ length: seconds }, (_, index) => (
            <CountdownBeat
              key={index}
              index={index}
              value={seconds - index}
              fps={fps}
              seconds={seconds}
            />
          ))}
        </div>

        <p
          style={{
            margin: 0,
            fontSize: 18,
            letterSpacing: '0.2em',
            color: COLORS.ink400,
            opacity: contentOpacity,
          }}
        >
          CHUẨN BỊ…
        </p>
      </AbsoluteFill>

      {/* ── Start signal ───────────────────────────────────────────── */}
      {frame >= outroAt - 4 ? (
        <AbsoluteFill
          style={{ alignItems: 'center', justifyContent: 'center' }}
        >
          <span
            style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 108,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              backgroundImage: GRADIENT_SPARK,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              opacity: goIn,
              transform: `scale(${0.7 + goIn * 0.3})`,
            }}
          >
            BẮT ĐẦU!
          </span>
        </AbsoluteFill>
      ) : null}

      <AbsoluteFill
        style={{
          backgroundColor: '#ffffff',
          opacity: flash,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  )
}

/** One number of the countdown: pops in, holds, then drops away. */
function CountdownBeat({
  index,
  value,
  fps,
  seconds,
}: {
  index: number
  value: number
  fps: number
  seconds: number
}) {
  const frame = useCurrentFrame()
  const local = frame - index * fps

  if (local < -2) return null

  const enter = spring({
    frame: Math.max(0, local),
    fps,
    config: { damping: 13, stiffness: 190 },
    durationInFrames: 16,
  })

  const exit = interpolate(local, [fps - 9, fps + 2], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  // Ring sweeps once per beat, matching the second it represents.
  const sweep = interpolate(local, [0, fps], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const radius = 118
  const circumference = 2 * Math.PI * radius

  const isLast = index === seconds - 1

  return (
    <div
      style={{
        position: 'absolute',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: exit,
      }}
    >
      <svg width={280} height={280} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
        <defs>
          <linearGradient id={`countdown-ring-${index}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={COLORS.neon400} />
            <stop offset="100%" stopColor={COLORS.violet400} />
          </linearGradient>
        </defs>
        <circle
          cx={140}
          cy={140}
          r={radius}
          fill="none"
          stroke={COLORS.ink700}
          strokeWidth={10}
        />
        <circle
          cx={140}
          cy={140}
          r={radius}
          fill="none"
          stroke={`url(#countdown-ring-${index})`}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * sweep}
        />
      </svg>

      <span
        style={{
          position: 'absolute',
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: 168,
          fontWeight: 700,
          color: isLast ? COLORS.spark300 : COLORS.ink50,
          opacity: enter,
          transform: `scale(${0.55 + enter * 0.45})`,
          letterSpacing: '-0.04em',
        }}
      >
        {value}
      </span>
    </div>
  )
}
