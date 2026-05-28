import { Card } from '@/components/ui/card'

export default function ArchivedLoading() {
  return (
    <div className="space-y-4">
      <div className="h-4 bg-muted rounded w-20 animate-pulse" />
      <header className="px-1 pt-2 pb-1 animate-pulse">
        <div className="h-7 bg-muted rounded w-32" />
        <div className="h-3 bg-muted/60 rounded w-40 mt-2" />
      </header>
      <Card className="p-0 gap-0 divide-y divide-foreground/10">
        {[0, 1].map((i) => (
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
