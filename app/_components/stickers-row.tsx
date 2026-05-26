import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { RedeemButton } from './redeem-button'

type Props = {
  reward: { id: number; name: string; emoji: string; targetCount: number } | null
  count: number
  canRedeem: boolean
  onRedeem: () => Promise<void>
}

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

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-medium truncate">
          <span className="mr-1">{reward.emoji}</span>
          <span className="font-semibold">{reward.name}</span>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums shrink-0">
          {count} / {target}
        </div>
      </div>
      <div className="flex flex-wrap gap-1 text-xl leading-none">
        {Array.from({ length: target }).map((_, i) => (
          <span key={i} aria-hidden>{i < filled ? '⭐' : '☆'}</span>
        ))}
      </div>
      {canRedeem && <RedeemButton onRedeem={onRedeem} rewardName={reward.name} />}
    </Card>
  )
}
