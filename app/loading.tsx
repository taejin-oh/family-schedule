import { Card } from '@/components/ui/card'

export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1">
        <h1 className="text-[30px] leading-tight font-bold tracking-tight">할 일</h1>
        <div className="text-sm text-muted-foreground mt-0.5 animate-pulse">불러오는 중…</div>
      </header>

      <Card className="p-4 gap-2 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="text-[36px] h-9 w-12 bg-muted rounded" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-muted rounded w-20" />
            <div className="h-4 bg-muted rounded w-2/3" />
          </div>
        </div>
        <div className="h-1.5 bg-muted rounded-full" />
      </Card>

      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-20 bg-muted rounded-full animate-pulse" />
        ))}
      </div>

      <Card className="p-0 gap-0 divide-y divide-foreground/10">
        {[0, 1, 2].map((i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-3 animate-pulse">
            <span className="w-6 h-6 rounded-full bg-muted flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 bg-muted rounded w-2/3" />
              <div className="h-3 bg-muted/60 rounded w-1/4" />
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}
