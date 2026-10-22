import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Infinity as InfinityIcon, LayoutDashboard, Menu, Trophy, X } from 'lucide-react'

import { EasyQuizLogo } from '@/components/brand/logo'
import { Button, ButtonLink } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { EnergyMeter } from '@/features/energy/energy-meter'
import { cn } from '@/lib/utils'

import { UserMenu } from './user-menu'

const NAV_ITEMS = [
  { to: '/explore', label: 'Khám phá', icon: null },
  { to: '/endless', label: 'Chế độ vô tận', icon: InfinityIcon },
  { to: '/leaderboard', label: 'Bảng xếp hạng', icon: Trophy },
] as const

export function SiteHeader() {
  const { status, user, isAdmin, isGuest } = useAuth()

  const [mobileOpen, setMobileOpen] = useState(false)

  const linkClasses = ({ isActive }: { isActive: boolean }) =>
    cn(
      'rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-200',
      isActive ? 'text-ink-50 bg-ink-800/80' : 'text-ink-300 hover:text-ink-50 hover:bg-ink-800/60',
    )

  return (
    <header className="border-ink-600/60 bg-ink-950/80 sticky top-0 z-50 border-b backdrop-blur-xl">
      <div className="container-page flex h-16 items-center gap-4">
        <Link to="/" aria-label="Easy Quiz — về trang chủ" className="shrink-0">
          <EasyQuizLogo compact />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Điều hướng chính">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClasses}>
              <span className="inline-flex items-center gap-1.5">
                {item.icon ? <item.icon className="size-4" aria-hidden /> : null}
                {item.label}
              </span>
            </NavLink>
          ))}

          {isAdmin ? (
            <NavLink to="/manage" className={linkClasses}>
              <span className="inline-flex items-center gap-1.5">
                <LayoutDashboard className="size-4" aria-hidden />
                Quản lý
              </span>
            </NavLink>
          ) : null}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <ButtonLink to="/endless" size="sm" className="hidden whitespace-nowrap sm:inline-flex">
            <InfinityIcon className="size-4" aria-hidden />
            Chơi ngay
          </ButtonLink>

          {isGuest ? (
            <Link
              to="/register"
              className="border-spark-400/40 bg-spark-400/10 text-spark-300 hover:border-spark-400/70 hidden rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors xl:inline-flex"
            >
              Lưu kết quả của bạn
            </Link>
          ) : null}

          {user ? <EnergyMeter /> : null}

          {status === 'loading' ? (
            <div className="bg-ink-800 h-9 w-24 animate-pulse rounded-full" aria-hidden />
          ) : user ? (
            <UserMenu guestJoin />
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <ButtonLink to="/login" variant="ghost" size="sm">
                Đăng nhập
              </ButtonLink>
              <ButtonLink to="/register" size="sm">
                Bắt đầu
              </ButtonLink>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {/* ── Mobile panel ─────────────────────────────────────────────── */}
      {mobileOpen ? (
        <div className="border-ink-600/60 bg-ink-950/95 border-t backdrop-blur-xl lg:hidden">
          <nav className="container-page flex flex-col gap-1 py-3" aria-label="Điều hướng di động">
            <ButtonLink
              to="/endless"
              size="sm"
              className="mb-2 justify-center sm:hidden"
              onClick={() => setMobileOpen(false)}
            >
              <InfinityIcon className="size-4" aria-hidden />
              Chơi ngay
            </ButtonLink>

            <NavLink
              to="/explore"
              className={linkClasses}
              onClick={() => setMobileOpen(false)}
            >
              Khám phá
            </NavLink>
            <NavLink
              to="/endless"
              className={linkClasses}
              onClick={() => setMobileOpen(false)}
            >
              Chế độ vô tận
            </NavLink>
            <NavLink
              to="/leaderboard"
              className={linkClasses}
              onClick={() => setMobileOpen(false)}
            >
              Bảng xếp hạng
            </NavLink>

            {isAdmin ? (
              <NavLink to="/manage" className={linkClasses} onClick={() => setMobileOpen(false)}>
                Quản lý
              </NavLink>
            ) : null}

            {!user ? (
              <div className="mt-2 flex gap-2">
                <ButtonLink
                  to="/login"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setMobileOpen(false)}
                >
                  Đăng nhập
                </ButtonLink>
                <ButtonLink
                  to="/register"
                  size="sm"
                  className="flex-1"
                  onClick={() => setMobileOpen(false)}
                >
                  Đăng ký
                </ButtonLink>
              </div>
            ) : null}
          </nav>
        </div>
      ) : null}
    </header>
  )
}
