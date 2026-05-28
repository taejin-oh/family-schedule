import { Card } from '@/components/ui/card'

export default function StickerHistoryLoading() {
  return (
    <div className="space-y-4">
      <div className="h-4 bg-muted rounded w-20 animate-pulse" />
      <header className="px-1 animate-pulse">
        <div className="h-7 bg-muted rounded w-32" />
        <div className="h-3 bg-muted/60 rounded w-40 mt-2" />
      </header>
      <Card className="p-4 gap-2 animate-pulse">
        <div className="h-3 bg-muted rounded w-32" />
        <ul className="text-sm space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-4 h-4 bg-muted rounded-full" />
              <div className="h-3 bg-muted/60 rounded flex-1" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
