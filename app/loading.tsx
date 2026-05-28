import { Card } from '@/components/ui/card'

/**
 * Root Suspense fallback — 아이 홈(/) 진입 시 보임. 다른 모든 페이지는
 * 자체 loading.tsx가 우선 적용. root layout 아래 page-level boundary.
 */
export default function RootLoading() {
  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1 flex items-end justify-between gap-2 animate-pulse">
        <div>
          <div className="h-9 bg-muted rounded w-16" />
          <div className="h-3 bg-muted/60 rounded w-32 mt-2" />
        </div>
      </header>

      {/* 스티커 보드 */}
      <Card className="p-3 animate-pulse">
        <div className="h-4 bg-muted/60 rounded w-2/3" />
      </Card>

      {/* 진행 카드 */}
      <Card className="p-4 gap-2 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="text-[40px] h-10 w-12 bg-muted rounded" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-muted/60 rounded w-20" />
            <div className="h-4 bg-muted rounded w-2/3" />
          </div>
        </div>
        <div className="h-1.5 bg-muted rounded-full" />
      </Card>

      {/* 오늘 해야 할 숙제 */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1 animate-pulse">
          불러오는 중…
        </h2>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="p-3 rounded-xl bg-card ring-1 ring-foreground/10 flex items-center gap-3 min-h-[76px] animate-pulse">
              <span className="w-6 h-6 rounded-full bg-muted flex-shrink-0" />
              <span className="w-[5px] h-10 rounded-full bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-2/3" />
                <div className="h-3 bg-muted/60 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
