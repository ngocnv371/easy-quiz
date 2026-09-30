/**
 * Shared motion constants for the DOM animation layer (Motion / CSS).
 *
 * Remotion compositions deliberately do NOT import from here: they must derive
 * every value from `useCurrentFrame()`, so mixing the two would only encourage
 * a CSS transition to leak into a render.
 */

export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

export const REVEAL_DURATION = 0.65

export const viewportOnce = { once: true, amount: 0.25 } as const

/** Spring-ish presets for the hand-rolled CSS keyframes. */
export const STAGGER = 0.06
