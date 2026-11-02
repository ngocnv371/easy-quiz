import { Home, Infinity as InfinityIcon, Trophy } from 'lucide-react'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { ButtonLink } from '@/components/ui/button'
import { usePageMeta } from '@/lib/seo'

export function NotFoundPage() {
  usePageMeta({ title: 'Không tìm thấy trang', noIndex: true, path: '/404' })

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5">
      <AuroraBackground variant="quiz" />

      <div className="relative max-w-lg text-center">
        <p className="font-display text-gradient text-7xl font-bold sm:text-9xl">404</p>

        <h1 className="font-display text-ink-50 mt-4 text-2xl font-semibold">
          Không tìm thấy trang này
        </h1>

        <p className="text-ink-300 mt-3 text-sm leading-relaxed">
          Có thể đường dẫn đã đổi hoặc trang này không còn nữa. Quay lại trang chủ, hoặc vào luyện
          tập ngay nhé.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink to="/" size="lg">
            <Home className="size-4" aria-hidden />
            Về trang chủ
          </ButtonLink>
          <ButtonLink to="/endless" variant="secondary" size="lg">
            <InfinityIcon className="size-4" aria-hidden />
            Luyện tập ngay
          </ButtonLink>
          <ButtonLink to="/leaderboard" variant="outline" size="lg">
            <Trophy className="size-4" aria-hidden />
            Bảng xếp hạng
          </ButtonLink>
        </div>

        <p className="text-ink-500 mt-8 text-xs">
          Bạn đang mở một liên kết đề thi cũ? Easy Quiz giờ chỉ còn chế độ vô tận — mọi câu hỏi
          đều có ở đó.
        </p>
      </div>
    </div>
  )
}
