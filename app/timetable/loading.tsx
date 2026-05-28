import { Card } from '@/components/ui/card'

/**
 * 시간표 진입 즉시 보이는 skeleton. 클릭 후 빈 화면 시간 제거.
 */
export default function TimetableLoading() {
  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1">
        <h1 className="text-[30px] leading-tight font-bold tracking-tight">시간표</h1>
        <p className="text-sm text-muted-foreground mt-0.5 animate-pulse">불러오는 중…</p>
      </header>

      {/* 진행률 chip row */}
      <div className="space-y-1.5 py-2 -my-2">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
          이번 주 숙제 진행
        </div>
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 w-20 bg-muted rounded-full animate-pulse" />
          ))}
        </div>
      </div>

      {/* 표 grid skeleton — 헤더 + 첫 8행 정도 */}
      <Card className="p-2 overflow-x-auto">
        <table className="w-full border-collapse text-sm table-fixed">
          <thead>
            <tr>
              <th className="w-10 sm:w-12" />
              {['월', '화', '수', '목', '금', '토', '일'].map((d) => (
                <th key={d} className="text-center py-2 text-xs font-semibold border-b border-foreground/10 animate-pulse">
                  <span className="inline-flex w-7 h-7 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-transparent">
                    {d}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }).map((_, i) => (
              <tr key={i} className="h-7">
                <td className="text-right pr-2 text-[10px] text-muted-foreground/40 align-top pt-0.5 whitespace-nowrap animate-pulse">
                  {i % 2 === 0 ? `${String(6 + Math.floor(i / 2)).padStart(2, '0')}:00` : ''}
                </td>
                {[0, 1, 2, 3, 4, 5, 6].map((j) => (
                  <td key={j} className="border-t border-l border-foreground/5" />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
