import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { RedeemButton } from './redeem-button'
import { cn } from '@/lib/utils'

type Props = {
  reward: { id: number; name: string; emoji: string; targetCount: number } | null
  count: number
  canRedeem: boolean
  onRedeem: () => Promise<void>
}

const RADIUS = 42
const CIRC = 2 * Math.PI * RADIUS

export function StickersRow({ reward, count, canRedeem, onRedeem }: Props) {
  if (!reward) {
    return (
      <Card className="p-3">
        <Link
          href="/admin/settings"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          🎁 부모님이 보상을 설정하면 스티커가 모여요 →
        </Link>
      </Card>
    )
  }
  const target = reward.targetCount
  const filled = Math.min(count, target)
  const arc = (filled / target) * CIRC
  const remaining = Math.max(0, target - filled)

  return (
    <Card className="p-4 gap-3">
      <div className="flex items-center gap-4">
        <div className="relative w-[100px] h-[100px] shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="#FEF3C7" strokeWidth="10" />
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="10"
              strokeDasharray={`${arc} ${CIRC}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-[40px] leading-none">
            🏆
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[18px] font-bold truncate">
            <span className="mr-1">{reward.emoji}</span>
            {reward.name}
          </div>
          <div className="text-[13px] text-muted-foreground mt-0.5">
            {canRedeem
              ? '목표 도달! 선물 받을 수 있어요 🎉'
              : `${count}개 모음 · ${remaining}개 더 모으면 보상!`}
          </div>
          <div className="flex flex-wrap gap-1 text-xl leading-none mt-2 text-amber-500">
            {Array.from({ length: target }).map((_, i) => (
              <span
                key={i}
                aria-hidden
                data-star-slot={i}
                data-empty={i >= filled ? 'true' : 'false'}
                className={cn(
                  'inline-block transition-colors',
                  i >= filled && 'text-muted-foreground/25',
                )}
              >
                ★
              </span>
            ))}
          </div>
        </div>
      </div>
      {canRedeem && <RedeemButton onRedeem={onRedeem} rewardName={reward.name} />}
    </Card>
  )
}
