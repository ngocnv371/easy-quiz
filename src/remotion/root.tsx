import { Composition, Folder, type CalculateMetadataFunction } from 'remotion'

import {
  LANDING_HERO_DURATION,
  LANDING_HERO_FPS,
  LANDING_HERO_HEIGHT,
  LANDING_HERO_ID,
  LANDING_HERO_WIDTH,
  LandingHero,
  landingHeroDefaults,
  type LandingHeroProps,
} from './landing-hero'
import {
  QUIZ_INTRO_DURATION,
  QUIZ_INTRO_FPS,
  QUIZ_INTRO_HEIGHT,
  QUIZ_INTRO_ID,
  QUIZ_INTRO_WIDTH,
  QuizIntro,
  quizIntroDefaults,
  type QuizIntroProps,
} from './quiz-countdown'
import {
  RESULT_REVEAL_DURATION,
  RESULT_REVEAL_FPS,
  RESULT_REVEAL_HEIGHT,
  RESULT_REVEAL_ID,
  RESULT_REVEAL_WIDTH,
  ResultReveal,
  resultRevealDefaults,
} from './result-reveal'

/**
 * Composition registry.
 *
 * The app plays these through `@remotion/player`, which does not read this
 * file — it is here so the same compositions can be rendered to video, and so
 * their ids, dimensions and durations live in one place.
 *
 * To open them in Remotion Studio, install the CLI and point it at
 * `src/remotion/index.ts`:
 *
 *   npm i -D @remotion/cli
 *   npx remotion studio src/remotion/index.ts
 */

/** The countdown's length is a function of its props, not a fixed number. */
export const quizIntroMetadata: CalculateMetadataFunction<QuizIntroProps> = ({ props }) => ({
  durationInFrames: (props.seconds ?? 3) * QUIZ_INTRO_FPS + 42,
})

export function RemotionRoot() {
  return (
    <Folder name="Easy-Quiz">
      <Composition
        id={LANDING_HERO_ID}
        component={LandingHero}
        durationInFrames={LANDING_HERO_DURATION}
        fps={LANDING_HERO_FPS}
        width={LANDING_HERO_WIDTH}
        height={LANDING_HERO_HEIGHT}
        defaultProps={landingHeroDefaults satisfies LandingHeroProps}
      />

      <Composition
        id={QUIZ_INTRO_ID}
        component={QuizIntro}
        durationInFrames={QUIZ_INTRO_DURATION}
        fps={QUIZ_INTRO_FPS}
        width={QUIZ_INTRO_WIDTH}
        height={QUIZ_INTRO_HEIGHT}
        defaultProps={quizIntroDefaults satisfies QuizIntroProps}
        calculateMetadata={quizIntroMetadata}
      />

      <Composition
        id={RESULT_REVEAL_ID}
        component={ResultReveal}
        durationInFrames={RESULT_REVEAL_DURATION}
        fps={RESULT_REVEAL_FPS}
        width={RESULT_REVEAL_WIDTH}
        height={RESULT_REVEAL_HEIGHT}
        defaultProps={resultRevealDefaults}
      />
    </Folder>
  )
}
