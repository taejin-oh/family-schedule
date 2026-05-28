import { Card } from '@/components/ui/card'

export default function AcademyNewLoading() {
  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1">
        <h1 className="text-[30px] leading-tight font-bold tracking-tight">새 학원</h1>
        <p className="text-sm text-muted-foreground mt-0.5 animate-pulse">불러오는 중…</p>
      </header>
      <Card className="p-6 space-y-4 animate-pulse">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 bg-muted rounded w-16" />
            <div className="h-9 bg-muted/60 rounded w-full" />
          </div>
        ))}
      </Card>
    </div>
  )
}
