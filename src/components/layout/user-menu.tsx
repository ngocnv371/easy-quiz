import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, LayoutDashboard, LineChart, LogOut, Sparkles, User } from 'lucide-react'

import { useAuth } from '@/features/auth/auth-context'
import { cn } from '@/lib/utils'

/**
 * The signed-in player's avatar chip plus its account menu.
 *
 * Shared by the site header and the Endless footer, so a signed-in player finds
 * the same actions — save an anonymous session, review progress, sign out —
 * wherever the chip sits. The panel opens downward by default and upward for
 * footers, aligned to whichever side of the chip has room.
 */
export function UserMenu({
  placement = 'bottom',
  align = 'end',
  size = 'md',
  guestJoin = false,
  dataCy,
  className,
}: {
  placement?: 'bottom' | 'top'
  align?: 'start' | 'end'
  size?: 'sm' | 'md'
  /** Offer guests a way to claim their session from inside the menu. */
  guestJoin?: boolean
  dataCy?: string
  className?: string
}) {
  const { user, profile, isAdmin, isGuest, displayName, signOut } = useAuth()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on an outside click or Escape, matching the header menu.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const handleSignOut = async () => {
    setOpen(false)
    await signOut()
    navigate('/')
  }

  if (!user) return null

  const compact = size === 'sm'

  return (
    <div className={cn('relative', className)} ref={menuRef} data-cy={dataCy}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'border-ink-600 bg-ink-800/70 hover:border-neon-400/60 flex items-center rounded-full border transition-colors',
          compact ? 'gap-1.5 py-1 pr-2.5 pl-1' : 'gap-2 py-1.5 pr-2.5 pl-1.5',
        )}
      >
        <span
          className={cn(
            'bg-ink-700 flex items-center justify-center rounded-full',
            compact ? 'size-5 text-[0.7rem]' : 'size-7 text-sm',
          )}
          aria-hidden
        >
          {profile?.avatar_emoji ?? '🎓'}
        </span>
        <span
          className={cn(
            'text-ink-100 truncate font-medium',
            compact ? 'max-w-[7rem] text-xs' : 'hidden max-w-28 text-sm sm:inline',
          )}
        >
          {displayName}
        </span>
        <ChevronDown
          className={cn(
            'text-ink-400 transition-transform duration-200',
            compact ? 'size-3.5' : 'size-4',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            'glass-panel shadow-panel absolute z-50 w-56 overflow-hidden rounded-xl p-1.5',
            align === 'end' ? 'right-0' : 'left-0',
            placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          <div className="border-ink-600/60 border-b px-3 py-2.5">
            <p className="text-ink-50 truncate text-sm font-medium">{displayName}</p>
            <p className="text-ink-400 truncate text-xs">
              {isGuest ? 'Phiên chơi ẩn danh' : (profile?.username ?? user.email)}
            </p>
          </div>

          {isGuest && guestJoin ? (
            <MenuLink to="/register" icon={Sparkles} onClick={() => setOpen(false)}>
              Lưu kết quả của bạn
            </MenuLink>
          ) : null}

          <MenuLink to="/progress" icon={LineChart} onClick={() => setOpen(false)}>
            Tiến độ học tập
          </MenuLink>

          <MenuLink to="/account" icon={User} onClick={() => setOpen(false)}>
            Tài khoản
          </MenuLink>

          {isAdmin ? (
            <MenuLink to="/manage" icon={LayoutDashboard} onClick={() => setOpen(false)}>
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
