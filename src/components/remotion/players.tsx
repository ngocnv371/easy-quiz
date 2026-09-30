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
  QUIZ_INTRO_FPS,
  QUIZ_INTRO_HEIGHT,
  QUIZ_INTRO_WIDTH,
  QuizIntro,
  type QuizIntroProps,
} from '@/remotion/quiz-countdown'
import {
  RESULT_REVEAL_DURATION,
  RESULT_REVEAL_FPS,
  RESULT_REVEAL_HEIGHT,
  RESULT_REVEAL_WIDTH,
  ResultReveal,
  type ResultRevealProps,
} from '@/remotion/result-reveal'
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

/** The 3-2-1 countdown played between the quiz page and the first question. */
export function QuizIntroVideo({
  className,
  ...props
}: QuizIntroProps & { className?: string }) {
  const { seconds, ...rest } = props

  return (
    <Player
      component={QuizIntro}
      inputProps={{ ...rest, seconds }}
      durationInFrames={seconds * QUIZ_INTRO_FPS + 42}
      fps={QUIZ_INTRO_FPS}
      compositionWidth={QUIZ_INTRO_WIDTH}
      compositionHeight={QUIZ_INTRO_HEIGHT}
      autoPlay
      loop={false}
      controls={false}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      allowFullscreen={false}
      showVolumeControls={false}
      moveToBeginningWhenEnded={false}
      initiallyMuted
      numberOfSharedAudioTags={0}
      style={PLAYER_STYLE}
      className={cn(className)}
    />
  )
}

/** The score reveal shown on the result page. */
export function ResultRevealVideo({
  className,
  ...props
}: ResultRevealProps & { className?: string }) {
  const reduceMotion = useReducedMotion()

  return (
    <Player
      component={ResultReveal}
      inputProps={props}
      durationInFrames={RESULT_REVEAL_DURATION}
      fps={RESULT_REVEAL_FPS}
      compositionWidth={RESULT_REVEAL_WIDTH}
      compositionHeight={RESULT_REVEAL_HEIGHT}
      autoPlay={!reduceMotion}
      // Jump to the settled frame when motion is reduced, so the score is
      // simply visible instead of animated.
      initialFrame={reduceMotion ? RESULT_REVEAL_DURATION - 30 : 0}
      loop={false}
      // Hold the final frame: the last frame is the finished score, so ending
      // there beats snapping back to an empty opening frame.
      moveToBeginningWhenEnded={false}
      controls={false}
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
