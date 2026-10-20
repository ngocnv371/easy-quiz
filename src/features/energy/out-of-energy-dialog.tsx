import { useNavigate } from 'react-router-dom'
import { Crown, UserPlus, Zap } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useAuth } from '@/features/auth/auth-context'

import { useEnergy } from './energy-context'
import { formatTimeUntil } from './format'

/**
 * Shown when a charge is refused. It never interrupts a question mid-way: the
 * Endless answer that triggered it was not graded or charged, so the player
 * can pick it again after refilling.
 *
 * Guests are steered to sign up first. That doubles their daily allowance at
 * once and is required before buying anyway.
 */
export function OutOfEnergyDialog() {
  const { energy, outOfEnergyOpen, closeOutOfEnergy } = useEnergy()
  const { isGuest } = useAuth()
  const navigate = useNavigate()

  const go = (to: string) => {
    closeOutOfEnergy()
    navigate(to)
  }

  return (
    <Modal
      open={outOfEnergyOpen}
      onClose={closeOutOfEnergy}
      icon={Zap}
      tone="spark"
      title="Hết năng lượng rồi!"
      description={
        energy
          ? `Năng lượng miễn phí sẽ được nạp lại sau ${formatTimeUntil(energy.resets_at)}.`
          : 'Năng lượng miễn phí được nạp lại lúc 0 giờ mỗi ngày.'
      }
    >
      <div data-cy="out-of-energy" className="space-y-4">
        <p className="text-ink-300 text-sm leading-relaxed">
          Mỗi câu trả lời dùng 1 năng lượng. Bạn có thể nghỉ một chút rồi quay lại vào ngày mai,
          hoặc nạp thêm để học tiếp ngay.
        </p>

        {isGuest ? (
          <div className="border-neon-400/30 bg-neon-400/5 rounded-xl border p-4 text-sm">
            <p className="text-ink-100 font-medium">Tạo tài khoản miễn phí</p>
            <p className="text-ink-300 mt-1">
              Nhận gấp đôi năng lượng mỗi ngày, giữ lại thành tích, và mở khoá nạp thêm.
            </p>
            <Button className="mt-3" size="sm" onClick={() => go('/register')}>
              <UserPlus className="size-4" aria-hidden />
              Tạo tài khoản
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button variant={isGuest ? 'outline' : 'primary'} onClick={() => go('/energy')}>
            <Zap className="size-4" aria-hidden />
            Nạp năng lượng
          </Button>
          <Button variant="outline" onClick={() => go('/energy#plus')}>
            <Crown className="size-4" aria-hidden />
            Easy Quiz Plus
          </Button>
          <Button variant="ghost" onClick={closeOutOfEnergy}>
            Để sau
          </Button>
        </div>
      </div>
    </Modal>
  )
}
