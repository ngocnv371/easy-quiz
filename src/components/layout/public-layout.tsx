import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'

/** Chrome for the public site: header, routed content, footer. */
export function PublicLayout() {
  const { pathname } = useLocation()

  // A client-side navigation should feel like a new page, not a scroll jump.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="focus:bg-ink-800 focus:text-ink-50 sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:px-4 focus:py-2"
      >
        Bỏ qua điều hướng
      </a>

      <SiteHeader />

      <main id="main-content" className="flex-1">
        <Outlet />
      </main>

      <SiteFooter />
    </div>
  )
}
