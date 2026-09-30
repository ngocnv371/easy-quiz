import type { CSSProperties } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'

import {
  Backdrop,
  Chip,
  Confetti,
  Gauge,
  LogoMark,
  gradientText,
  panelStyle,
  useEnter,
  usePop,
} from './parts'
import { COLORS } from './theme'

export const LANDING_HERO_ID = 'EasyQuizLandingHero'
export const LANDING_HERO_DURATION = 360 // 12s at 30fps
export const LANDING_HERO_FPS = 30
export const LANDING_HERO_WIDTH = 1200
export const LANDING_HERO_HEIGHT = 640

export type LandingHeroProps = {
  headline: string
  subhead: string
  question: string
  options: string[]
  correctIndex: number
  score: number
  maxScore: number
  streak: number
  players: { name: string; avatar: string; score: number }[]
}

export const landingHeroDefaults: LandingHeroProps = {
  headline: 'Học vui, nhớ lâu',
  subhead: 'Trắc nghiệm theo chủ đề · Chơi ngay, không cần tài khoản',
  question: 'Thủ đô của Việt Nam là thành phố nào?',
  options: ['Hà Nội', 'Huế', 'Đà Nẵng', 'TP. Hồ Chí Minh'],
  correctIndex: 0,
  score: 900,
  maxScore: 1000,
  streak: 7,
  players: [
    { name: 'Ngọc Anh', avatar: '🦊', score: 900 },
    { name: 'Minh Quân', avatar: '🐼', score: 800 },
    { name: 'Thảo Vy', avatar: '🦉', score: 700 },
  ],
}

// Timeline landmarks, in frames. The sequence settles by ~frame 190 and then
// holds, so the landing page spends most of the loop in its "full" state.
const T = {
  logo: 4,
  headline: 18,
  subhead: 34,
  card: 80,
  options: 96,
  answer: 150,
  panel: 168,
  fadeOut: 340,
} as const

/**
 * The landing-page hero: a quiz being answered, scored and ranked, on a loop.
 *
 * Every value comes from `useCurrentFrame()` so the same component renders
 * identically in the browser player and in a headless render.
 */
export function LandingHero({
  headline,
  subhead,
  question,
  options,
  correctIndex,
  score,
  maxScore,
  streak,
  players,
}: LandingHeroProps) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  const logo = usePop(T.logo)
  const headlineIn = useEnter(T.headline, 32)
  const subheadIn = useEnter(T.subhead, 30)
  const cardIn = useEnter(T.card, 34)

  // The whole composition dips out at the end so the loop restarts cleanly.
  const outro = interpolate(frame, [T.fadeOut, durationInFrames - 6], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  // Answer reveal: the correct tile lights up and the score starts moving.
  const answerProgress = interpolate(frame, [T.answer, T.answer + 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const scoreProgress = interpolate(frame, [T.answer + 10, T.answer + 60], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const displayedScore = Math.round(score * scoreProgress)
  const gaugeFill = (score / maxScore) * scoreProgress

  return (
    <AbsoluteFill style={{ opacity: outro }}>
      <Backdrop />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: '46px 64px',
          display: 'flex',
          flexDirection: 'column',
          gap: 30,
        }}
      >
        {/* ── Masthead ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              transform: `scale(${logo})`,
              opacity: logo,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 60,
              height: 60,
              borderRadius: 18,
              border: `1px solid ${COLORS.ink600}`,
              backgroundColor: `${COLORS.ink800}cc`,
            }}
          >
            <LogoMark size={40} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: 26,
                fontWeight: 600,
                color: COLORS.ink50,
                letterSpacing: '-0.02em',
              }}
            >
              Easy<span style={gradientText}> Quiz</span>
            </span>
            <span style={{ fontSize: 13, color: COLORS.ink400, letterSpacing: '0.16em' }}>
              AITECHX
            </span>
          </div>

          <div style={{ marginLeft: 'auto', opacity: subheadIn }}>
            <Chip tone="spark">🔥 Chuỗi {streak} câu đúng</Chip>
          </div>
        </div>

        {/* ── Headline ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 50,
              lineHeight: 1.04,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: COLORS.ink50,
              opacity: headlineIn,
              transform: `translateY(${(1 - headlineIn) * 26}px)`,
            }}
          >
            {headline}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 17,
              color: COLORS.ink300,
              opacity: subheadIn,
              transform: `translateY(${(1 - subheadIn) * 16}px)`,
            }}
          >
            {subhead}
          </p>
        </div>

        {/* ── Question + scoreboard ────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 20, flex: 1, minHeight: 0 }}>
          <QuestionCard
            question={question}
            options={options}
            correctIndex={correctIndex}
            progress={cardIn}
            answerProgress={answerProgress}
            frame={frame}
          />

          <ScorePanel
            players={players}
            progress={useEnter(T.panel, 34)}
            gaugeFill={gaugeFill}
            displayedScore={displayedScore}
            maxScore={maxScore}
            accuracy={Math.round((score / maxScore) * 100)}
          />
        </div>
      </div>

      <Confetti start={T.answer + 4} originX="330px" originY="330px" />
    </AbsoluteFill>
  )
}

// ── Left column ────────────────────────────────────────────────────────────
function QuestionCard({
  question,
  options,
  correctIndex,
  progress,
  answerProgress,
  frame,
}: {
  question: string
  options: string[]
  correctIndex: number
  progress: number
  answerProgress: number
  frame: number
}) {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F']

  return (
    <div
      style={{
        ...panelStyle,
        flex: '1 1 58%',
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        opacity: progress,
        transform: `translateY(${(1 - progress) * 40}px) scale(${0.97 + progress * 0.03})`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Chip tone="neon">Câu 4 / 10</Chip>
        <Chip tone="neutral">⏱ 00:18</Chip>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 14,
            letterSpacing: '0.18em',
            color: COLORS.ink400,
          }}
        >
          TOÁN HỌC
        </span>
      </div>

      <p
        style={{
          margin: 0,
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: 24,
          lineHeight: 1.25,
          fontWeight: 600,
          color: COLORS.ink50,
          letterSpacing: '-0.01em',
        }}
      >
        {question}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
        {options.map((option, index) => (
          <OptionTile
            key={option}
            letter={letters[index] ?? '?'}
            label={option}
            index={index}
            isCorrect={index === correctIndex}
            answerProgress={answerProgress}
            frame={frame}
          />
        ))}
      </div>
    </div>
  )
}

function OptionTile({
  letter,
  label,
  index,
  isCorrect,
  answerProgress,
  frame,
}: {
  letter: string
  label: string
  index: number
  isCorrect: boolean
  answerProgress: number
  frame: number
}) {
  // Options arrive one after another, then the key one reacts.
  const enter = useEnter(T.options + index * 7, 24)

  const highlight = isCorrect ? answerProgress : 0
  // Wrong options recede once the answer lands.
  const dim = isCorrect ? 0 : answerProgress * 0.55

  const ring = isCorrect
    ? interpolate(frame, [T.answer, T.answer + 30], [1.6, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1

  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '9px 14px',
    borderRadius: 12,
    border: `1px solid ${highlight > 0.4 ? COLORS.correct400 : COLORS.ink600}`,
    backgroundColor:
      highlight > 0.4
        ? `${COLORS.correct500}24`
        : `rgba(13,18,36,${0.75 - dim})`,
    opacity: enter * (1 - dim),
    transform: `translateX(${(1 - enter) * 26}px) scale(${ring})`,
    boxShadow: highlight > 0.4 ? `0 0 34px -8px ${COLORS.correct400}b3` : 'none',
  }

  return (
    <div style={style}>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 700,
          color: highlight > 0.4 ? COLORS.ink950 : COLORS.ink200,
          backgroundColor: highlight > 0.4 ? COLORS.correct400 : `${COLORS.ink700}`,
        }}
      >
        {highlight > 0.4 ? '✓' : letter}
      </span>

      <span style={{ fontSize: 17, color: COLORS.ink100, fontWeight: 500 }}>{label}</span>
    </div>
  )
}

// ── Right column ───────────────────────────────────────────────────────────
function ScorePanel({
  players,
  progress,
  gaugeFill,
  displayedScore,
  maxScore,
  accuracy,
}: {
  players: { name: string; avatar: string; score: number }[]
  progress: number
  gaugeFill: number
  displayedScore: number
  maxScore: number
  accuracy: number
}) {
  return (
    <div
      style={{
        flex: '1 1 42%',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        opacity: progress,
        transform: `translateY(${(1 - progress) * 40}px)`,
      }}
    >
      <div
        style={{
          ...panelStyle,
          padding: 18,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <Gauge size={112} strokeWidth={12} progress={gaugeFill} tone="spark">
          <span
            style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 28,
              fontWeight: 700,
              color: COLORS.ink50,
              letterSpacing: '-0.02em',
            }}
          >
            {displayedScore}
          </span>
          <span style={{ fontSize: 11, color: COLORS.ink400 }}>/ {maxScore} điểm</span>
        </Gauge>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Chip tone="correct">✓ Đúng {Math.round((accuracy / 100) * 10)}/10</Chip>
          <Chip tone="spark">🏆 Phá kỷ lục</Chip>
          <Chip tone="neutral">⚡ +120 XP</Chip>
        </div>
      </div>

      <div style={{ ...panelStyle, padding: 18, flex: 1 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 17,
              fontWeight: 600,
              color: COLORS.ink50,
            }}
          >
            Bảng xếp hạng
          </span>
          <span style={{ fontSize: 12, color: COLORS.ink400 }}>tuần này</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {players.map((player, index) => (
            <LeaderboardRow
              key={player.name}
              rank={index + 1}
              {...player}
              delay={T.panel + 16 + index * 8}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const MEDALS = ['🥇', '🥈', '🥉']

function LeaderboardRow({
  rank,
  name,
  avatar,
  score,
  delay,
}: {
  rank: number
  name: string
  avatar: string
  score: number
  delay: number
}) {
  const enter = useEnter(delay, 26)
  const isTop = rank === 1

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderRadius: 12,
        border: `1px solid ${isTop ? `${COLORS.spark400}66` : COLORS.ink600}`,
        backgroundColor: isTop ? `${COLORS.spark400}14` : `${COLORS.ink800}99`,
        opacity: enter,
        transform: `translateX(${(1 - enter) * 34}px)`,
      }}
    >
      <span style={{ fontSize: 17, width: 22 }}>{MEDALS[rank - 1] ?? rank}</span>
      <span style={{ fontSize: 19 }}>{avatar}</span>
      <span style={{ fontSize: 16, color: COLORS.ink100, fontWeight: 500 }}>{name}</span>
      <span
        style={{
          marginLeft: 'auto',
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: 17,
          fontWeight: 700,
          color: isTop ? COLORS.spark300 : COLORS.ink200,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {score}
      </span>
    </div>
  )
}
