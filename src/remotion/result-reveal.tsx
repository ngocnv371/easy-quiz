import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'

import {
  Backdrop,
  Chip,
  Confetti,
  Gauge,
  LogoMark,
  panelStyle,
  useEnter,
  usePop,
} from './parts'
import { COLORS, GRADIENT_SPARK } from './theme'

export const RESULT_REVEAL_ID = 'EasyQuizResultReveal'
export const RESULT_REVEAL_FPS = 30
export const RESULT_REVEAL_WIDTH = 1200
export const RESULT_REVEAL_HEIGHT = 640
export const RESULT_REVEAL_DURATION = 210 // 7s at 30fps

export type ResultRevealProps = {
  playerName: string
  quizTitle: string
  score: number
  maxScore: number
  correctCount: number
  questionCount: number
  accuracy: number
  /** True when this run beat the player's own best on the quiz. */
  isRecord: boolean
  durationLabel: string
}

export const resultRevealDefaults: ResultRevealProps = {
  playerName: 'Ngọc Anh',
  quizTitle: 'Toán lớp 6 · Số tự nhiên',
  score: 900,
  maxScore: 1000,
  correctCount: 9,
  questionCount: 10,
  accuracy: 90,
  isRecord: true,
  durationLabel: '3 phút 12 giây',
}

/**
 * The reveal played when a quiz is submitted: the score ring fills, the total
 * counts up, and the headline verdict lands — with confetti when it was earned.
 */
export function ResultReveal({
  playerName,
  quizTitle,
  score,
  maxScore,
  correctCount,
  questionCount,
  accuracy,
  isRecord,
  durationLabel,
}: ResultRevealProps) {
  const frame = useCurrentFrame()

  const headerIn = useEnter(6, 26)
  const ringIn = usePop(14, 34)
  const headlineIn = useEnter(34, 30)
  const chipsIn = useEnter(96, 30)

  const celebrate = accuracy >= 70

  // Score counts up in step with the ring.
  const scoreProgress = interpolate(frame, [20, 76], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const displayedScore = Math.round(score * scoreProgress)
  const gaugeFill = (score / maxScore) * ringIn * scoreProgress

  // No fade-out here on purpose. Unlike the looping landing hero, this plays
  // once and then holds, so the last frame must be the finished score rather
  // than an empty stage.

  const verdict =
    accuracy >= 90
      ? 'Xuất sắc!'
      : accuracy >= 70
        ? 'Làm tốt lắm!'
        : accuracy >= 50
          ? 'Khá ổn!'
          : 'Cố lên nhé!'

  return (
    <AbsoluteFill>
      <Backdrop withSpark />

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          gap: 22,
          padding: '40px 64px',
        }}
      >
        {/* ── Who and what ─────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            opacity: headerIn,
            transform: `translateY(${(1 - headerIn) * 16}px)`,
          }}
        >
          <LogoMark size={34} />
          <span style={{ fontSize: 20, color: COLORS.ink200, fontWeight: 500 }}>
            {playerName}
          </span>
          <span style={{ fontSize: 20, color: COLORS.ink500 }}>·</span>
          <span style={{ fontSize: 20, color: COLORS.ink300 }}>{quizTitle}</span>
        </div>

        {/* ── Score ring ───────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 54,
            ...panelStyle,
            padding: '34px 52px',
            transform: `scale(${0.94 + ringIn * 0.06})`,
            opacity: ringIn,
          }}
        >
          <Gauge size={236} strokeWidth={18} progress={gaugeFill} tone={celebrate ? 'spark' : 'brand'}>
            <span
              style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: 66,
                fontWeight: 700,
                color: COLORS.ink50,
                letterSpacing: '-0.03em',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {displayedScore}
            </span>
            <span style={{ fontSize: 17, color: COLORS.ink400 }}>/ {maxScore} điểm</span>
          </Gauge>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 340 }}>
            <span
              style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: 54,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                backgroundImage: GRADIENT_SPARK,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                opacity: headlineIn,
                transform: `translateX(${(1 - headlineIn) * -22}px)`,
              }}
            >
              {verdict}
            </span>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                opacity: chipsIn,
                transform: `translateY(${(1 - chipsIn) * 14}px)`,
              }}
            >
              <Chip tone="correct">
                ✓ Đúng {correctCount}/{questionCount} câu
              </Chip>
              <Chip tone="neon">🎯 {Math.round(accuracy)}% chính xác</Chip>
              <Chip tone="neutral">⏱ {durationLabel}</Chip>
              {isRecord ? <Chip tone="spark">🏆 Kỷ lục mới</Chip> : null}
            </div>
          </div>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: 18,
            letterSpacing: '0.06em',
            color: COLORS.ink400,
            opacity: useEnter(140, 26),
          }}
        >
          Kết quả đã được đưa lên bảng xếp hạng
        </p>
      </AbsoluteFill>

      {celebrate ? (
        <>
          <Confetti start={30} originX="330px" originY="320px" spread={1.05} />
          <Confetti start={44} originX="880px" originY="320px" count={22} spread={0.85} />
        </>
      ) : null}
    </AbsoluteFill>
  )
}
