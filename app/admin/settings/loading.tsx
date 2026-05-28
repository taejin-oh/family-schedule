import { Card } from '@/components/ui/card'

export default function SettingsLoading() {
  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1">
        <h1 className="text-[30px] leading-tight font-bold tracking-tight">설정</h1>
        <p className="text-sm text-muted-foreground mt-0.5 animate-pulse">불러오는 중…</p>
      </header>
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="p-4 gap-2 animate-pulse">
          <div className="h-3 bg-muted rounded w-32" />
          <div className="h-4 bg-muted/60 rounded w-2/3" />
          <div className="h-4 bg-muted/60 rounded w-1/2" />
        </Card>
      ))}
    </div>
  )
}
