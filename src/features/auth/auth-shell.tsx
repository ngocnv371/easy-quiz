import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { BrandCredit } from '@/components/brand/logo'
import { EasyQuizMark } from '@/components/brand/marks'
import { usePageMeta } from '@/lib/seo'

/** Shared frame for the sign-in and sign-up screens. */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description: ReactNode
  children: ReactNode
  footer: ReactNode
}) {
  const { pathname } = useLocation()

  usePageMeta({
    title,
    description: typeof description === 'string' ? description : undefined,
    path: pathname,
  })

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <AuroraBackground variant="quiz" />

      <div className="relative flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="mb-8 flex justify-center"
            aria-label="Easy Quiz — về trang chủ"
          >
            <EasyQuizMark className="size-11" />
          </Link>

          <div className="glass-panel shadow-panel rounded-2xl p-7 sm:p-8">
            <h1 className="font-display text-ink-50 text-2xl font-semibold tracking-tight">
              {title}
            </h1>
            <p className="text-ink-300 mt-2 text-sm leading-relaxed">{description}</p>

            <div className="mt-7">{children}</div>
          </div>

          <div className="text-ink-300 mt-6 text-center text-sm">{footer}</div>

          <div className="mt-10 flex justify-center">
            <BrandCredit />
          </div>
        </div>
      </div>
    </div>
  )
}
