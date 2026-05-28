import { Card } from '@/components/ui/card'

export default function EmptyStatesLoading() {
  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1">
        <h1 className="text-[30px] leading-tight font-bold tracking-tight">빈 상태 카피</h1>
        <p className="text-sm text-muted-foreground mt-0.5 animate-pulse">불러오는 중…</p>
      </header>
      {[0, 1, 2, 3, 4].map((i) => (
        <Card key={i} className="p-4 gap-2 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-muted rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-2/3" />
              <div className="h-3 bg-muted/60 rounded w-1/2" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
