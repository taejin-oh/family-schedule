import Link from 'next/link'
import { listAcademies, listArchivedAcademies, archiveAcademy, unarchiveAcademy } from '@/server/actions/academies'
import { revalidatePath } from 'next/cache'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AcademyRow } from './_components/academy-row'
import { subjectLabel } from '@/lib/subjects'

const DAY_KO: Record<string, string> = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' }

export default async function AcademiesPage() {
  const [rows, archivedRows] = await Promise.all([listAcademies(), listArchivedAcademies()])
  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1 flex items-end justify-between gap-2">
        <div>
          <h1 className="text-[30px] lg:text-[34px] leading-tight font-bold tracking-tight">학원</h1>
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
          <div className="lg:columns-2 lg:gap-x-5 space-y-2 lg:space-y-0 [&>div]:lg:mb-2 [&>div]:lg:break-inside-avoid">
            {rows.map((r) => {
              const sub = subjectLabel(r.subject)
              const sched = r.scheduleRule?.slots && r.scheduleRule.slots.length > 0
                ? r.scheduleRule.slots.map((s) => `${DAY_KO[s.day] ?? s.day} ${s.start}–${s.end}`).join(' · ')
                : null
              const academyId = r.id
              const onArchiveOne = async () => {
                'use server'
                await archiveAcademy(academyId)
                revalidatePath('/academies')
                revalidatePath('/academies/archived')
                revalidatePath('/')
              }
              const onUnarchiveOne = async () => {
                'use server'
                await unarchiveAcademy(academyId)
                revalidatePath('/academies')
                revalidatePath('/academies/archived')
                revalidatePath('/')
              }
              return (
                <div key={r.id}>
                  <Card className="p-0 gap-0">
                    <AcademyRow
                      id={r.id}
                      name={r.name}
                      color={r.color}
                      subjectLabel={sub}
                      scheduleLabel={sched}
                      onArchive={onArchiveOne}
                      onUnarchive={onUnarchiveOne}
                    />
                  </Card>
                </div>
              )
            })}
          </div>
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
