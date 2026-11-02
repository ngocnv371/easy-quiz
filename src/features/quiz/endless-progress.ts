/**
 * Turning raw endless-mode counts into something a player can read.
 *
 * `endless_progress` stores counts, not a mastery label, because the label is a
 * product decision that can change without a migration. Everything here is pure
 * so the route can render it directly and a tweak to the thresholds has one
 * home.
 */

export type AreaStrength = 'strong' | 'steady' | 'new'

/** Accuracy (0–100) at or above which an area counts as a strength. */
export const STRONG_ACCURACY = 75

/** Below this, an area is still being built. */
export const STEADY_ACCURACY = 45

/**
 * Answers an area needs before its accuracy means anything. Under this it stays
 * "new", so one lucky (or unlucky) answer never labels a whole topic.
 */
export const MIN_ANSWERED = 5

export const AREA_LABELS: Record<AreaStrength, string> = {
  strong: 'Điểm mạnh',
  steady: 'Đang tiến bộ',
  new: 'Đang khám phá',
}

export const AREA_HINTS: Record<AreaStrength, string> = {
  strong: 'Bạn sẽ gặp nhiều câu ở phần này hơn.',
  steady: 'Đang đi đúng hướng — thêm vài câu nữa nhé.',
  new: 'Một vùng mới đang chờ bạn khám phá.',
}

/** Classify an area by its accuracy, once it has enough answers to judge. */
export function areaStrength(accuracy: number, answered: number): AreaStrength {
  if (answered < MIN_ANSWERED) return 'new'
  if (accuracy >= STRONG_ACCURACY) return 'strong'
  if (accuracy >= STEADY_ACCURACY) return 'steady'
  return 'new'
}

const STRENGTH_RANK: Record<AreaStrength, number> = { strong: 0, steady: 1, new: 2 }

/**
 * Which areas the stream is currently favouring, strongest first: by label,
 * then accuracy, then how much has been answered. Ranking by label first keeps
 * a 1/1 area from sitting above one proven over many answers. Used to explain
 * the adaptive behaviour instead of leaving it a black box.
 */
export function sortByStrength<T extends { accuracy: number; answered: number }>(
  areas: T[],
): T[] {
  const rank = (area: T) => STRENGTH_RANK[areaStrength(area.accuracy, area.answered)]
  return [...areas].sort(
    (a, b) => rank(a) - rank(b) || b.accuracy - a.accuracy || b.answered - a.answered,
  )
}
