import { Card } from '@/components/ui/card'

/**
 * Suspense boundary fallback. 탭 누르는 즉시 이 skeleton이 보이고,
 * server data fetch 끝나면 page.tsx로 swap. navigation perception 개선.
 */
export default function RecurringLoading() {
  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1 flex items-end justify-between gap-2">
        <div>
          <h1 className="text-[30px] leading-tight font-bold tracking-tight">매일/매주 할 일</h1>
          <div className="text-sm text-muted-foreground mt-0.5 animate-pulse">불러오는 중…</div>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1">
          이번 주 매주 할 일
        </h2>
        <Card className="p-0 gap-0 divide-y divide-foreground/10">
          {[0, 1].map((i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-3 animate-pulse">
              <span className="w-[5px] h-9 rounded-full bg-muted flex-shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-3 bg-muted/60 rounded w-1/3" />
              </div>
            </div>
          ))}
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1">
          오늘의 매일 할 일
        </h2>
        <Card className="p-0 gap-0 divide-y divide-foreground/10">
          {[0, 1, 2].map((i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-3 animate-pulse">
              <span className="w-[5px] h-9 rounded-full bg-muted flex-shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="h-4 bg-muted rounded w-2/3" />
                <div className="h-3 bg-muted/60 rounded w-1/4" />
              </div>
            </div>
          ))}
        </Card>
      </section>
    </div>
  )
}
