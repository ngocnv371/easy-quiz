import { useId } from 'react'

/**
 * Marks in the AiTechX house style: single-weight strokes on a 24×24 grid,
 * round caps and joins, painted with the family gradient (neon → violet →
 * magenta) plus Easy Quiz's own amber spark.
 *
 * `EasyQuizMark` is the same drawing as `public/favicon.svg`, so the logo in
 * the header is literally the one in the browser tab.
 */

const GRADIENT_STOPS = [
  { offset: '0%', color: '#67e8f9' },
  { offset: '55%', color: '#a78bfa' },
  { offset: '100%', color: '#f472b6' },
] as const

const SPARK = '#fbbf24'

interface MarkProps {
  className?: string
}

/** `useId` emits colons, which are unsafe inside `url(#…)`. */
function useGradientId(prefix: string): string {
  return `${prefix}-${useId().replace(/:/g, '')}`
}

/** A question mark inside a rounded tile, its dot lit as a spark. */
export function EasyQuizMark({ className }: MarkProps) {
  const gradientId = useGradientId('easy-quiz-mark')

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="4"
          x2="24"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          {GRADIENT_STOPS.map((stop) => (
            <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </linearGradient>
      </defs>
      <g
        stroke={`url(#${gradientId})`}
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3.6" y="4.2" width="16.8" height="16.4" rx="5.2" />
        <path d="M9.55 10.4a2.6 2.6 0 0 1 5.06.83c0 1.75-2.45 2.1-2.45 3.72" />
      </g>
      <circle cx="12.16" cy="17.4" r="1.12" fill={SPARK} />
      <path
        d="M19.1 1.5l.62 1.53 1.53.62-1.53.62-.62 1.53-.62-1.53-1.53-.62 1.53-.62z"
        fill={SPARK}
      />
    </svg>
  )
}

/** The AiTechX parent mark — an angular monogram drawn in the same gradient. */
export function AiTechXMark({ className }: MarkProps) {
  const gradientId = useGradientId('aitechx-mark')

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="0"
          x2="24"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          {GRADIENT_STOPS.map((stop) => (
            <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </linearGradient>
      </defs>
      <g
        stroke={`url(#${gradientId})`}
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19.4 10.9 4.6a1.24 1.24 0 0 1 2.2 0L20 19.4" />
        <path d="M7.7 13.6h8.6" />
      </g>
    </svg>
  )
}
