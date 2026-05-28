import { Card } from '@/components/ui/card'

export default function UploadLoading() {
  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1">
        <h1 className="text-[30px] leading-tight font-bold tracking-tight">숙제 추가</h1>
        <p className="text-sm text-muted-foreground mt-0.5 animate-pulse">불러오는 중…</p>
      </header>

      <Card className="p-6 space-y-5">
        <div className="space-y-2 animate-pulse">
          <div className="h-4 bg-muted rounded w-20" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </div>

        <div className="space-y-2 animate-pulse">
          <div className="h-4 bg-muted rounded w-24" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-16 bg-muted rounded" />
            <div className="h-16 bg-muted rounded" />
          </div>
        </div>
      </Card>
    </div>
  )
}
