import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ChevronDown, LayoutDashboard, LogOut, Menu, Trophy, User, X } from 'lucide-react'

import { EasyQuizLogo } from '@/components/brand/logo'
import { Button, ButtonLink } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/explore', label: 'Khám phá', icon: null },
  { to: '/leaderboard', label: 'Bảng xếp hạng', icon: Trophy },
] as const

export function SiteHeader() {
  const { status, user, profile, isTeacher, isGuest, displayName, signOut } = useAuth()
  const navigate = useNavigate()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close the avatar menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const handleSignOut = async () => {
    setMenuOpen(false)
    setMobileOpen(false)
    await signOut()
    navigate('/')
  }

  const linkClasses = ({ isActive }: { isActive: boolean }) =>
    cn(
      'rounded-full px-3.5 py-2 text-sm font-medium transition-colors duration-200',
      isActive ? 'text-ink-50 bg-ink-800/80' : 'text-ink-300 hover:text-ink-50 hover:bg-ink-800/60',
    )

  return (
    <header className="border-ink-600/60 bg-ink-950/80 sticky top-0 z-50 border-b backdrop-blur-xl">
      <div className="container-page flex h-16 items-center gap-4">
        <Link to="/" aria-label="Easy Quiz — về trang chủ" className="shrink-0">
          <EasyQuizLogo compact />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Điều hướng chính">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClasses}>
              <span className="inline-flex items-center gap-1.5">
                {item.icon ? <item.icon className="size-4" aria-hidden /> : null}
                {item.label}
              </span>
            </NavLink>
          ))}

          {isTeacher ? (
            <NavLink to="/manage" className={linkClasses}>
              <span className="inline-flex items-center gap-1.5">
                <LayoutDashboard className="size-4" aria-hidden />
                Quản lý
              </span>
            </NavLink>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isGuest ? (
            <Link
              to="/register"
              className="border-spark-400/40 bg-spark-400/10 text-spark-300 hover:border-spark-400/70 hidden rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:inline-flex"
            >
              Lưu kết quả của bạn
            </Link>
          ) : null}

          {status === 'loading' ? (
            <div className="bg-ink-800 h-9 w-24 animate-pulse rounded-full" aria-hidden />
          ) : user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="border-ink-600 bg-ink-800/70 hover:border-neon-400/60 flex items-center gap-2 rounded-full border py-1.5 pr-2.5 pl-1.5 transition-colors"
              >
                <span
                  className="bg-ink-700 flex size-7 items-center justify-center rounded-full text-sm"
                  aria-hidden
                >
                  {profile?.avatar_emoji ?? '🎓'}
                </span>
                <span className="text-ink-100 hidden max-w-28 truncate text-sm font-medium sm:inline">
                  {displayName}
                </span>
                <ChevronDown
                  className={cn(
                    'text-ink-400 size-4 transition-transform duration-200',
                    menuOpen && 'rotate-180',
                  )}
                  aria-hidden
                />
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  className="glass-panel shadow-panel absolute right-0 mt-2 w-56 overflow-hidden rounded-xl p-1.5"
                >
                  <div className="border-ink-600/60 border-b px-3 py-2.5">
                    <p className="text-ink-50 truncate text-sm font-medium">{displayName}</p>
                    <p className="text-ink-400 truncate text-xs">
                      {isGuest ? 'Phiên chơi ẩn danh' : (profile?.username ?? user.email)}
                    </p>
                  </div>

                  <MenuLink to="/account" icon={User} onClick={() => setMenuOpen(false)}>
                    Tài khoản
                  </MenuLink>

                  {isTeacher ? (
                    <MenuLink
                      to="/manage"
                      icon={LayoutDashboard}
                      onClick={() => setMenuOpen(false)}
                    >
                      Trang quản lý
                    </MenuLink>
                  ) : null}

                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    className="text-ink-300 hover:bg-ink-800/70 hover:text-ink-50 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors"
                  >
                    <LogOut className="size-4" aria-hidden />
                    Đăng xuất
                  </button>
                </div>
              ) : null}
            </div>
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
            className="md:hidden"
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
        <div className="border-ink-600/60 bg-ink-950/95 border-t backdrop-blur-xl md:hidden">
          <nav className="container-page flex flex-col gap-1 py-3" aria-label="Điều hướng di động">
            <NavLink
              to="/explore"
              className={linkClasses}
              onClick={() => setMobileOpen(false)}
            >
              Khám phá
            </NavLink>
            <NavLink
              to="/leaderboard"
              className={linkClasses}
              onClick={() => setMobileOpen(false)}
            >
              Bảng xếp hạng
            </NavLink>

            {isTeacher ? (
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

function MenuLink({
  to,
  icon: Icon,
  children,
  onClick,
}: {
  to: string
  icon: typeof User
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      onClick={onClick}
      className="text-ink-300 hover:bg-ink-800/70 hover:text-ink-50 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors"
    >
      <Icon className="size-4" aria-hidden />
      {children}
    </Link>
  )
}
