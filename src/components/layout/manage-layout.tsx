import { NavLink, Outlet, Link } from 'react-router-dom'
import { BarChart3, LayoutList, PlusCircle, Sparkles, ArrowLeft } from 'lucide-react'

import { EasyQuizLogo } from '@/components/brand/logo'
import { useAuth } from '@/features/auth/auth-context'
import { usePageMeta } from '@/lib/seo'
import { cn } from '@/lib/utils'

const LINKS = [
  { to: '/manage', label: 'Tổng quan', icon: BarChart3, end: true },
  { to: '/manage/quizzes', label: 'Đề thi của tôi', icon: LayoutList, end: false },
  { to: '/manage/quizzes/new', label: 'Tạo đề mới', icon: PlusCircle, end: true },
] as const

/** Shell for the teacher console: persistent sidebar, routed workspace. */
export function ManageLayout() {
  const { displayName, profile } = useAuth()

  // The console sits behind auth and has nothing a crawler would want.
  usePageMeta({ title: 'Trang quản lý', noIndex: true, path: '/manage' })

  return (
    <div className="bg-ink-950 flex min-h-dvh flex-col lg:flex-row">
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside className="border-ink-600/60 bg-ink-900/60 shrink-0 border-b backdrop-blur-xl lg:sticky lg:top-0 lg:h-dvh lg:w-72 lg:border-r lg:border-b-0">
        <div className="flex h-full flex-col gap-6 p-5">
          <Link to="/" aria-label="Easy Quiz — về trang chủ" className="inline-flex">
            <EasyQuizLogo markClassName="size-7" />
          </Link>

          <div className="border-ink-600/60 flex items-center gap-3 rounded-xl border bg-ink-800/60 p-3">
            <span className="bg-ink-700 flex size-9 items-center justify-center rounded-full text-base">
              {profile?.avatar_emoji ?? '🎓'}
            </span>
            <div className="min-w-0">
              <p className="text-ink-50 truncate text-sm font-medium">{displayName}</p>
              <p className="text-spark-300 text-xs">Giáo viên</p>
            </div>
          </div>

          <nav className="flex flex-col gap-1" aria-label="Điều hướng quản lý">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors duration-200',
                    isActive
                      ? 'border-neon-400/40 bg-neon-400/10 text-neon-300 border'
                      : 'text-ink-300 hover:bg-ink-800/70 hover:text-ink-50',
                  )
                }
              >
                <link.icon className="size-4" aria-hidden />
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="border-ink-600/60 mt-auto space-y-3 border-t pt-4">
            <div className="border-spark-400/30 bg-spark-400/8 rounded-xl border p-3">
              <p className="text-spark-300 inline-flex items-center gap-1.5 text-xs font-semibold">
                <Sparkles className="size-3.5" aria-hidden />
                AI Assist
              </p>
              <p className="text-ink-300 mt-1 text-xs leading-relaxed">
                Mô tả chủ đề, AI soạn giúp bạn 10 câu hỏi kèm đáp án — chỉ trong vài giây.
              </p>
            </div>

            <Link
              to="/"
              className="text-ink-400 hover:text-neon-300 inline-flex items-center gap-2 text-xs transition-colors"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Về trang chủ
            </Link>
          </div>
        </div>
      </aside>

      {/* ── Workspace ────────────────────────────────────────────────── */}
      <main id="main-content" className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
