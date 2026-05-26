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
      <header className="px-1 pt-2 pb-1 flex items-end justify-between gap-2">
        <div>
          <h1 className="text-[30px] leading-tight font-bold tracking-tight">학원</h1>
          <div className="text-sm text-muted-foreground mt-0.5">
            {rows.length}개{archivedRows.length > 0 && ` · 보관 ${archivedRows.length}개`}
          </div>
        </div>
        <Link href="/academies/new" className={cn(buttonVariants({ size: 'sm' }))}>+ 추가</Link>
      </header>

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1">
          현재 다니는 학원
        </h2>
        {rows.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            등록된 학원이 없습니다.
          </Card>
        ) : (
          <Card className="p-0 gap-0 divide-y divide-foreground/10">
            {rows.map((r) => {
              const sub = SUBJECT_KO[r.subject] ?? r.subject
              const sched = r.scheduleRule?.slots && r.scheduleRule.slots.length > 0
                ? r.scheduleRule.slots.map((s) => `${DAY_KO[s.day] ?? s.day} ${s.start}–${s.end}`).join(' · ')
                : null
              return (
                <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                  <span
                    className="w-[5px] h-9 rounded-full flex-shrink-0"
                    style={{ background: r.color }}
                    aria-hidden
                  />
                  <Link
                    href={`/academies/${r.id}`}
                    className="flex-1 min-w-0 -m-1 p-1 rounded-md hover:bg-accent transition-colors"
                  >
                    <div className="font-medium text-[15px]">{r.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {sub}{sched && ` · ${sched}`}
                    </div>
                  </Link>
                  <Link
                    href={`/academies/${r.id}/edit`}
                    className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
                  >
                    편집
                  </Link>
                  <form action={onArchive}>
                    <input type="hidden" name="id" value={r.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      title="보관함에서 나중에 복원할 수 있어요"
                    >
                      보관
                    </Button>
                  </form>
                </div>
              )
            })}
          </Card>
        )}
      </section>

      {archivedRows.length > 0 && (
        <p className="text-xs text-muted-foreground px-1">
          보관한 학원은{' '}
          <Link href="/academies/archived" className="underline underline-offset-2 hover:text-foreground">
            보관함 ({archivedRows.length})
          </Link>
          에서 언제든 복원할 수 있어요.
        </p>
      )}
    </div>
  )
}
