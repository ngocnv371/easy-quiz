import { Player } from '@remotion/player'
import { useReducedMotion } from 'motion/react'

import {
  LANDING_HERO_DURATION,
  LANDING_HERO_FPS,
  LANDING_HERO_HEIGHT,
  LANDING_HERO_WIDTH,
  LandingHero,
  landingHeroDefaults,
  type LandingHeroProps,
} from '@/remotion/landing-hero'
import {
  QUESTION_REVEAL_DURATION,
  QUESTION_REVEAL_FPS,
  QUESTION_REVEAL_HEIGHT,
  QUESTION_REVEAL_WIDTH,
  QuestionReveal,
  questionRevealDefaults,
  type QuestionRevealProps,
} from '@/remotion/question-reveal'
import { cn } from '@/lib/utils'

/**
 * In-app wrappers around `@remotion/player`.
 *
 * Each one fills its container and lets the player scale the composition, so
 * callers only have to size the box. Ambient pieces respect
 * `prefers-reduced-motion` by starting paused rather than autoplaying.
 */

const PLAYER_STYLE: React.CSSProperties = { width: '100%', height: '100%' }

/** The looping hero shown on the landing page. */
export function LandingHeroVideo({
  className,
  showControls = false,
  ...props
}: Partial<LandingHeroProps> & { className?: string; showControls?: boolean }) {
  const reduceMotion = useReducedMotion()

  return (
    <Player
      component={LandingHero}
      inputProps={{ ...landingHeroDefaults, ...props }}
      durationInFrames={LANDING_HERO_DURATION}
      fps={LANDING_HERO_FPS}
      compositionWidth={LANDING_HERO_WIDTH}
      compositionHeight={LANDING_HERO_HEIGHT}
      autoPlay={!reduceMotion}
      loop
      controls={showControls}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      allowFullscreen={false}
      showVolumeControls={false}
      initiallyMuted
      numberOfSharedAudioTags={0}
      style={PLAYER_STYLE}
      className={cn(className)}
    />
  )
}

/**
 * The question-change flourish, played once per question in Endless mode.
 *
 * It is a decoration, not the question: it holds its final (transparent) frame
 * and never intercepts a click, so the real answer tiles below stay live the
 * whole time.
 */
export function QuestionRevealVideo({
  className,
  ...props
}: QuestionRevealProps & { className?: string }) {
  return (
    <Player
      component={QuestionReveal}
      inputProps={{ ...questionRevealDefaults, ...props }}
      durationInFrames={QUESTION_REVEAL_DURATION}
      fps={QUESTION_REVEAL_FPS}
      compositionWidth={QUESTION_REVEAL_WIDTH}
      compositionHeight={QUESTION_REVEAL_HEIGHT}
      autoPlay
      loop={false}
      controls={false}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      allowFullscreen={false}
      showVolumeControls={false}
      // Hold the last frame: it is the settled, transparent one.
      moveToBeginningWhenEnded={false}
      initiallyMuted
      numberOfSharedAudioTags={0}
      style={PLAYER_STYLE}
      className={cn(className)}
    />
  )
}
