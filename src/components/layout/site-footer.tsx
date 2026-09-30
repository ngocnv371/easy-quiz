import { Link } from 'react-router-dom'

import { BrandCredit } from '@/components/brand/logo'
import { BRAND_URL, TAGLINE } from '@/lib/site'

const LINK_GROUPS = [
  {
    title: 'Học tập',
    links: [
      { to: '/explore', label: 'Khám phá đề thi' },
      { to: '/leaderboard', label: 'Bảng xếp hạng' },
      { to: '/register', label: 'Tạo tài khoản' },
    ],
  },
  {
    title: 'Dành cho giáo viên',
    links: [
      { to: '/manage', label: 'Trang quản lý' },
      { to: '/manage/quizzes/new', label: 'Tạo đề thi mới' },
    ],
  },
] as const

/** Read once at module scope: rendering should not consult the clock. */
const COPYRIGHT_YEAR = new Date().getFullYear()

export function SiteFooter() {
  return (
    <footer className="border-ink-600/60 relative mt-24 border-t">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <p className="font-display text-ink-50 text-xl font-semibold tracking-tight">
            Easy<span className="text-gradient-spark"> Quiz</span>
          </p>
          <p className="text-ink-300 mt-3 max-w-sm text-sm leading-relaxed">
            {TAGLINE} — nền tảng trắc nghiệm của AiTechX. Chơi ngay không cần tài khoản, leo bảng
            xếp hạng mỗi ngày, và để AI Assist lo phần tạo đề.
          </p>
          <div className="mt-5">
            <BrandCredit />
          </div>
        </div>

        {LINK_GROUPS.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="text-ink-100 text-sm font-semibold tracking-wide">{group.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {group.links.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-ink-300 hover:text-neon-300 text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-ink-600/60 border-t">
        <div className="container-page text-ink-400 flex flex-col gap-3 py-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {COPYRIGHT_YEAR} AiTechX. Bảo lưu mọi quyền.</p>
          <div className="flex items-center gap-4">
            <a
              href={BRAND_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-neon-300 transition-colors"
            >
              aitechx.vn
            </a>
            <span className="text-ink-600" aria-hidden>
              •
            </span>
            <span>Dự án nội bộ</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
