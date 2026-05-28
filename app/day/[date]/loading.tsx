import { Card } from '@/components/ui/card'

export default function DayLoading() {
  return (
    <div className="space-y-4">
      <div className="h-4 bg-muted rounded w-20 animate-pulse" />

      <Card className="p-5 space-y-2 animate-pulse">
        <div className="h-7 bg-muted rounded w-32" />
        <div className="h-4 bg-muted/60 rounded w-40" />
      </Card>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold px-1 animate-pulse text-muted-foreground">불러오는 중…</h2>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="p-3 rounded-xl bg-card ring-1 ring-foreground/10 flex items-center gap-3 min-h-[76px] animate-pulse">
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
