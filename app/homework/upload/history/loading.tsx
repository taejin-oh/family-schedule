import { Card } from '@/components/ui/card'

export default function UploadHistoryLoading() {
  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1">
        <h1 className="text-[30px] leading-tight font-bold tracking-tight">업로드 이력</h1>
        <p className="text-sm text-muted-foreground mt-0.5 animate-pulse">불러오는 중…</p>
      </header>
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-3 animate-pulse">
            <div className="flex gap-3">
              <div className="w-16 h-16 bg-muted rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-3 bg-muted/60 rounded w-1/3" />
                <div className="h-3 bg-muted/60 rounded w-1/4" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
