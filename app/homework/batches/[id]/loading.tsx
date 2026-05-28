import { Card } from '@/components/ui/card'

export default function ProcessingLoading() {
  return (
    <Card className="p-6 sm:p-8 space-y-5 animate-pulse">
      <div className="text-center space-y-1.5">
        <div className="h-3 bg-muted rounded w-12 mx-auto" />
        <div className="h-6 bg-muted rounded w-48 mx-auto" />
      </div>
      <ul className="space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg">
            <span className="shrink-0 w-7 h-7 rounded-full bg-muted" />
            <div className="h-4 bg-muted/60 rounded w-40" />
          </li>
        ))}
      </ul>
    </Card>
  )
}
