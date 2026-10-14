import type { Variants } from 'motion/react'

/**
 * Element-level question animations.
 *
 * These are Motion variants, not CSS keyframes, because they animate the real
 * prompt words and answer tiles — the actual DOM the player reads and clicks.
 * A composition cannot do that: Remotion draws its own copy on a canvas-like
 * timeline. So Remotion keeps the "intro" beat and Motion owns the elements.
 *
 * A recipe pairs a prompt entrance with a choice entrance so the two read as one
 * choreography; the player cycles recipes per question.
 */

export type PromptUnit = 'words' | 'chars'

export interface QuestionMotionRecipe {
  name: string
  prompt: { unit: PromptUnit; container: Variants; item: Variants }
  choice: { container: Variants; item: Variants }
}

const SPRING = { type: 'spring', stiffness: 300, damping: 26, mass: 0.9 } as const
const SOFT = { type: 'spring', stiffness: 150, damping: 22 } as const
const POP = { type: 'spring', stiffness: 460, damping: 18, mass: 0.8 } as const
const EASE_OUT = { duration: 0.5, ease: [0.16, 1, 0.3, 1] } as const

/** Splits a prompt into the units a recipe animates. */
export function tokenizePrompt(text: string, unit: PromptUnit): string[] {
  if (unit === 'chars') return Array.from(text)
  return text.split(/\s+/).filter(Boolean)
}

export const QUESTION_MOTION_RECIPES: QuestionMotionRecipe[] = [
  {
    // Words rise and unblur; choices settle up underneath them.
    name: 'cascade',
    prompt: {
      unit: 'words',
      container: { visible: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } },
      item: {
        hidden: { y: 26, opacity: 0, filter: 'blur(10px)' },
        visible: { y: 0, opacity: 1, filter: 'blur(0px)', transition: SPRING },
      },
    },
    choice: {
      container: { visible: { transition: { staggerChildren: 0.07, delayChildren: 0.16 } } },
      item: {
        hidden: { y: 30, opacity: 0, scale: 0.97 },
        visible: { y: 0, opacity: 1, scale: 1, transition: SPRING },
      },
    },
  },
  {
    // Everything flips down into place like a split-flap board.
    name: 'flip',
    prompt: {
      unit: 'words',
      container: { visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } },
      item: {
        hidden: { rotateX: -96, y: 18, opacity: 0, transformPerspective: 900 },
        visible: { rotateX: 0, y: 0, opacity: 1, transformPerspective: 900, transition: SPRING },
      },
    },
    choice: {
      container: { visible: { transition: { staggerChildren: 0.075, delayChildren: 0.14 } } },
      item: {
        hidden: { rotateX: -70, y: 16, opacity: 0, transformPerspective: 900 },
        visible: { rotateX: 0, y: 0, opacity: 1, transformPerspective: 900, transition: SPRING },
      },
    },
  },
  {
    // Character-by-character pop for the prompt; choices blow in from the left.
    name: 'letters',
    prompt: {
      unit: 'chars',
      container: { visible: { transition: { staggerChildren: 0.017 } } },
      item: {
        hidden: { y: 16, opacity: 0, scale: 0.5 },
        visible: { y: 0, opacity: 1, scale: 1, transition: POP },
      },
    },
    choice: {
      container: { visible: { transition: { staggerChildren: 0.06, delayChildren: 0.22 } } },
      item: {
        hidden: { x: -34, opacity: 0 },
        visible: { x: 0, opacity: 1, transition: SPRING },
      },
    },
  },
  {
    // Prompt drifts in from the left; choices converge from both sides.
    name: 'drift',
    prompt: {
      unit: 'words',
      container: { visible: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } } },
      item: {
        hidden: { x: -36, opacity: 0, filter: 'blur(12px)' },
        visible: { x: 0, opacity: 1, filter: 'blur(0px)', transition: SOFT },
      },
    },
    choice: {
      container: { visible: { transition: { staggerChildren: 0.085, delayChildren: 0.16 } } },
      item: {
        hidden: (index: number) => ({ x: index % 2 === 0 ? -44 : 44, opacity: 0, scale: 0.98 }),
        visible: { x: 0, opacity: 1, scale: 1, transition: SPRING },
      },
    },
  },
  {
    // A camera dolly: the prompt settles out of a blur, choices bloom up.
    name: 'dolly',
    prompt: {
      unit: 'words',
      container: { visible: { transition: { staggerChildren: 0.05 } } },
      item: {
        hidden: { scale: 1.18, opacity: 0, filter: 'blur(14px)' },
        visible: { scale: 1, opacity: 1, filter: 'blur(0px)', transition: SOFT },
      },
    },
    choice: {
      container: { visible: { transition: { staggerChildren: 0.07, delayChildren: 0.2 } } },
      item: {
        hidden: { scale: 0.82, y: 18, opacity: 0 },
        visible: { scale: 1, y: 0, opacity: 1, transition: POP },
      },
    },
  },
  {
    // A quick, confident drop with a hint of overshoot.
    name: 'drop',
    prompt: {
      unit: 'words',
      container: { visible: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } } },
      item: {
        hidden: { y: -34, opacity: 0 },
        visible: { y: 0, opacity: 1, transition: POP },
      },
    },
    choice: {
      container: { visible: { transition: { staggerChildren: 0.065, delayChildren: 0.14 } } },
      item: {
        hidden: { y: -26, opacity: 0, scale: 0.98 },
        visible: { y: 0, opacity: 1, scale: 1, transition: EASE_OUT },
      },
    },
  },
]
