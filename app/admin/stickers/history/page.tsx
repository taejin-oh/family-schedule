import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { ArrowLeft } from 'lucide-react'
import {
  getStickerState,
  listRedemptions,
  removeStamp as removeStampAction,
} from '@/server/actions/stickers'
import { Card } from '@/components/ui/card'

/**
 * 스티커 이력 풀 페이지. 설정 카드의 부담을 덜기 위해 분리(M26).
 * - 모은 스티커 전체 (오래된 순으로 저장돼있어서 reverse하여 최신 위로)
 * - 받은 보상 전체
 */
export default async function StickerHistoryPage() {
  const [stickers, redemptions] = await Promise.all([
    getStickerState(),
    listRedemptions(),
  ])

  async function removeStamp(formData: FormData) {
    'use server'
    const id = Number(formData.get('id'))
    await removeStampAction(id)
    revalidatePath('/admin/stickers/history')
    revalidatePath('/admin/settings')
    revalidatePath('/')
  }

  return (
    <div className="space-y-4">
      <Link
        href="/admin/settings"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> 설정
      </Link>

      <header className="px-1">
        <h1 className="text-[30px] leading-tight font-bold tracking-tight">스티커 이력</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          현재 모은 <span className="font-bold tabular-nums">{stickers.count}</span>개
          {stickers.target != null && (
            <span className="text-muted-foreground"> / {stickers.target}</span>
          )}
        </p>
      </header>

      <Card className="p-4 gap-2">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          모은 스티커 ({stickers.stamps.length})
        </h2>
        {stickers.stamps.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 스티커가 없어요.</p>
        ) : (
          <ul className="text-sm space-y-2 max-h-[60vh] overflow-auto">
            {[...stickers.stamps].reverse().map((st) => (
              <li key={st.id} className="flex items-center gap-2">
                <span className="text-reward text-lg" aria-hidden>★</span>
                <span className="text-muted-foreground">
                  {st.kind === 'auto'
                    ? `자동 · ${st.forDate}`
                    : `보너스${st.notes ? ` · ${st.notes}` : ''}`}
                </span>
                <form action={removeStamp} className="inline ml-auto">
                  <input type="hidden" name="id" value={st.id} />
                  <button
                    type="submit"
                    className="text-destructive hover:underline text-xs"
                  >
                    지우기
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {redemptions.length > 0 && (
        <Card className="p-4 gap-2">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            받은 보상 ({redemptions.length})
          </h2>
          <ul className="text-sm space-y-1.5 max-h-[60vh] overflow-auto">
            {redemptions.map((r) => (
              <li key={r.id} className="flex items-baseline gap-2">
                <span className="text-lg" aria-hidden>{r.rewardEmoji}</span>
                <span className="font-medium">{r.rewardName}</span>
                <span className="text-xs text-muted-foreground">
                  · {new Date(r.redeemedAt).toLocaleDateString('ko-KR')} · {r.targetCount}개
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
