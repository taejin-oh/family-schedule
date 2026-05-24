import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { listCommittedItems, toggleItemDone } from '@/server/actions/homework'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

function formatDueLabel(due: string | null, today: string): string | null {
  if (!due) return null
  const todayD = new Date(today + 'T00:00:00')
  const dueD = new Date(due + 'T00:00:00')
  const diffMs = dueD.getTime() - todayD.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return `${Math.abs(diffDays)}일 지남`
  if (diffDays === 0) return '오늘'
  if (diffDays === 1) return '내일'
  if (diffDays <= 7) return `${diffDays}일 후`
  return due  // YYYY-MM-DD
}

export default async function HomePage() {
  const items = await listCommittedItems()
  const today = new Date().toISOString().slice(0, 10)

  async function onToggle(formData: FormData) {
    'use server'
    const id = Number(formData.get('id'))
    await toggleItemDone(id, true)
    revalidatePath('/')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">할 일</h1>
        <Link href="/homework/upload" className={cn(buttonVariants())}>
          📷 사진/PDF 추가
        </Link>
      </div>

      {items.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground space-y-2">
          <div className="text-3xl">🎉</div>
          <div>할 일이 없습니다.</div>
          <div className="text-xs">사진이나 PDF를 업로드하면 AI가 숙제를 정리해 줍니다.</div>
        </Card>
      ) : (
        <Card className="p-0 divide-y">
          {items.map((it) => {
            const dueLabel = formatDueLabel(it.dueDate, today)
            const isOverdue = dueLabel?.includes('지남')
            const isToday = dueLabel === '오늘'
            return (
              <div key={it.id} className="p-3 flex items-start gap-3">
                <form action={onToggle}>
                  <input type="hidden" name="id" value={it.id} />
                  <button
                    type="submit"
                    className="mt-0.5 w-6 h-6 rounded-full border-2 border-muted-foreground hover:border-foreground hover:bg-accent transition-colors flex items-center justify-center"
                    aria-label="완료"
                  >
                    {/* empty circle; on click → done */}
                  </button>
                </form>
                <span
                  className="mt-2 w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: it.academyColor }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium break-words">{it.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {it.academyName}
                    {dueLabel && (
                      <>
                        {' · '}
                        <span
                          className={cn(
                            isOverdue && 'text-destructive font-medium',
                            isToday && 'text-foreground font-medium'
                          )}
                        >
                          {dueLabel}
                        </span>
                      </>
                    )}
                  </div>
                  {it.notes && (
                    <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words line-clamp-3">
                      {it.notes}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </Card>
      )}
    </div>
  )
}
