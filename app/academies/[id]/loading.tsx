import { Card } from '@/components/ui/card'

export default function AcademyDetailLoading() {
  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1 animate-pulse">
        <div className="h-3 bg-muted rounded w-16 mb-2" />
        <div className="flex items-center gap-2">
          <span className="inline-block w-[5px] h-7 rounded-full bg-muted" />
          <div className="h-7 bg-muted rounded w-32" />
        </div>
      </header>

      <Card className="p-4 gap-2 animate-pulse">
        <div className="space-y-2">
          <div className="h-3 bg-muted rounded w-20" />
          <div className="h-4 bg-muted rounded w-3/4" />
        </div>
      </Card>

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1 animate-pulse">
          불러오는 중…
        </h2>
        <Card className="p-0 gap-0 divide-y">
          {[0, 1, 2].map((i) => (
            <div key={i} className="p-3 flex items-start gap-3 animate-pulse">
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted/60 rounded w-1/4" />
              </div>
            </div>
          ))}
        </Card>
      </section>
    </div>
  )
}
