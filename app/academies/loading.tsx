import { Card } from '@/components/ui/card'

export default function AcademiesLoading() {
  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1 flex items-end justify-between gap-2">
        <div>
          <h1 className="text-[30px] leading-tight font-bold tracking-tight">학원</h1>
          <div className="text-sm text-muted-foreground mt-0.5 animate-pulse">불러오는 중…</div>
        </div>
      </header>

      <Card className="p-0 gap-0 divide-y divide-foreground/10">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-3 animate-pulse">
            <span className="w-[5px] h-9 rounded-full bg-muted flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-1/3" />
              <div className="h-3 bg-muted/60 rounded w-1/2" />
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}
