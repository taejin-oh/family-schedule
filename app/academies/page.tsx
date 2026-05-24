import Link from 'next/link'
import { listAcademies, listArchivedAcademies, archiveAcademy } from '@/server/actions/academies'
import { revalidatePath } from 'next/cache'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const SUBJECT_KO: Record<string, string> = {
  math: '수학', english: '영어', korean: '국어', art: '미술',
  music: '음악', pe: '체육', science: '과학', other: '기타',
}
const DAY_KO: Record<string, string> = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' }

export default async function AcademiesPage() {
  const [rows, archivedRows] = await Promise.all([listAcademies(), listArchivedAcademies()])
  async function onArchive(formData: FormData) {
    'use server'
    const id = Number(formData.get('id'))
    await archiveAcademy(id)
    revalidatePath('/academies')
    revalidatePath('/academies/archived')
    revalidatePath('/')
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">학원 목록</h1>
        <div className="flex items-center gap-2">
          {archivedRows.length > 0 && (
            <Link
              href="/academies/archived"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
            >
              📦 보관함 ({archivedRows.length})
            </Link>
          )}
          <Link href="/academies/new" className={cn(buttonVariants())}>+ 새 학원</Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          등록된 학원이 없습니다.
        </Card>
      ) : (
        <Card className="divide-y p-0">
          {rows.map((r) => (
            <div key={r.id} className="p-4 flex items-center gap-3">
              <Link
                href={`/academies/${r.id}`}
                className="flex items-center gap-3 flex-1 min-w-0 -m-2 p-2 rounded-md hover:bg-accent transition-colors"
              >
                <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: r.color }} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {SUBJECT_KO[r.subject] ?? r.subject}
                    {r.scheduleRule?.slots && r.scheduleRule.slots.length > 0 && (
                      ' · ' + r.scheduleRule.slots.map((s) => `${DAY_KO[s.day] ?? s.day} ${s.start}–${s.end}`).join(' · ')
                    )}
                  </div>
                </div>
              </Link>
              <Link href={`/academies/${r.id}/edit`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>편집</Link>
              <form action={onArchive}>
                <input type="hidden" name="id" value={r.id} />
                <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive">보관</Button>
              </form>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
