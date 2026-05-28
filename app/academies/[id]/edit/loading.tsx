import { Card } from '@/components/ui/card'

export default function AcademyEditLoading() {
  return (
    <div className="space-y-4">
      <div className="h-4 bg-muted rounded w-20 animate-pulse" />
      <header className="px-1 pt-2 pb-1 animate-pulse">
        <div className="h-7 bg-muted rounded w-32" />
      </header>
      <Card className="p-6 space-y-4 animate-pulse">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 bg-muted rounded w-16" />
            <div className="h-9 bg-muted/60 rounded w-full" />
          </div>
        ))}
      </Card>
    </div>
  )
}
