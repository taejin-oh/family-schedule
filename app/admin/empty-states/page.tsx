import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getEmptyStates } from '@/server/actions/empty-states'
import { EmptyStateEditor } from './_components/empty-state-editor'

export default async function EmptyStatesPage() {
  const states = await getEmptyStates()

  return (
    <div className="space-y-4">
      <Link
        href="/admin/settings"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden />
        설정으로
      </Link>
      <header className="px-1 pt-1 pb-1">
        <h1 className="text-[30px] leading-tight font-bold tracking-tight">오늘 끝 카피</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          아이 홈의 “오늘 할 일이 없어요” 메시지 ({states.length}개)
        </p>
      </header>

      <div className="rounded-xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p>• 매일 시드 기반으로 한 개가 선택돼요. 같은 날엔 같은 메시지가 보이고, 다음 날부터 바뀝니다.</p>
        <p>• 좋은 카피는 “끝/완료/도착/박수/메달/칭찬” 같이 다 끝낸 상태와 직접 연결되는 표현이에요.</p>
        <p>• 우리 스티커·별 시스템과 헷갈리는 표현(예: “별 다 모았어”)은 피해주세요.</p>
      </div>

      <EmptyStateEditor initial={states} />
    </div>
  )
}
