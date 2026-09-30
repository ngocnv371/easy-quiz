import { Link } from 'react-router-dom'
import { Compass, Home, Trophy } from 'lucide-react'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { ButtonLink } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5">
      <AuroraBackground variant="quiz" />

      <div className="relative max-w-lg text-center">
        <p className="font-display text-gradient text-7xl font-bold sm:text-9xl">404</p>

        <h1 className="font-display text-ink-50 mt-4 text-2xl font-semibold">
          Không tìm thấy trang này
        </h1>

        <p className="text-ink-300 mt-3 text-sm leading-relaxed">
          Có thể đường dẫn đã đổi, hoặc đề thi bạn đang tìm chưa được xuất bản. Thử lại từ thư
          viện đề thi nhé.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink to="/" size="lg">
            <Home className="size-4" aria-hidden />
            Về trang chủ
          </ButtonLink>
          <ButtonLink to="/explore" variant="secondary" size="lg">
            <Compass className="size-4" aria-hidden />
            Khám phá đề thi
          </ButtonLink>
          <ButtonLink to="/leaderboard" variant="outline" size="lg">
            <Trophy className="size-4" aria-hidden />
            Bảng xếp hạng
          </ButtonLink>
        </div>

        <p className="text-ink-500 mt-8 text-xs">
          Bạn đang cần liên kết cũ?{' '}
          <Link to="/explore" className="text-neon-300 hover:underline">
            Tìm lại trong thư viện
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
