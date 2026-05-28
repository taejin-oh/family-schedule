import { Card } from '@/components/ui/card'

export default function ReviewLoading() {
  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1 animate-pulse">
        <div className="h-7 bg-muted rounded w-40" />
        <div className="h-3 bg-muted/60 rounded w-24 mt-2" />
      </header>

      <section className="space-y-2">
        <div className="h-3 bg-muted rounded w-20 px-1 pt-1 animate-pulse" />
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="p-3 animate-pulse">
              <div className="flex items-center gap-2">
                <div className="h-4 bg-muted rounded w-8" />
                <div className="h-4 bg-muted rounded flex-1" />
                <div className="h-3 bg-muted/60 rounded w-14" />
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
