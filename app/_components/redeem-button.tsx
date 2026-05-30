'use client'

import { useTransition } from 'react'

export function RedeemButton({
  onRedeem,
  rewardName,
}: {
  onRedeem: () => Promise<void>
  rewardName: string
}) {
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (pending) return
        if (!confirm(`"${rewardName}" 보상을 줬어요?\n확인하면 스티커가 0부터 다시 시작돼요.`)) return
        start(async () => {
          await onRedeem()
        })
      }}
      className="w-full bg-good hover:bg-good/90 disabled:bg-good/50 text-white font-medium py-2.5 rounded-lg transition-colors"
    >
      🎉 선물 받기!
    </button>
  )
}
