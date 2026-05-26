import { Check } from 'lucide-react'
import {
  listTodayRecurring,
  listThisWeekRecurring,
  listRecurringTasks,
  markRecurringDone,
  markRecurringUndone,
  archiveRecurringTask,
  createRecurringTask,
  updateRecurringTask,
} from '@/server/actions/recurring'
import { revalidatePath } from 'next/cache'
import { Card } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { localDateIso } from '@/server/util/date'
import Link from 'next/link'
import { RecurringForm } from './_components/recurring-form'

type DayKey = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'

const DAY_KO: Record<DayKey, string> = {
  mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일',
}

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; id?: string }>
}) {
  const sp = await searchParams
  const todayIso = localDateIso()
  const [todayTasks, weekTasks, allTasks] = await Promise.all([
    listTodayRecurring(),
    listThisWeekRecurring(),
    listRecurringTasks(),
  ])

  async function onMarkDone(formData: FormData) {
    'use server'
    const taskId = Number(formData.get('taskId'))
    const date = String(formData.get('date'))
    await markRecurringDone(taskId, date)
    revalidatePath('/recurring')
    revalidatePath('/')
    revalidatePath('/dashboard')
  }

  async function onMarkUndone(formData: FormData) {
    'use server'
    const taskId = Number(formData.get('taskId'))
    const date = String(formData.get('date'))
    await markRecurringUndone(taskId, date)
    revalidatePath('/recurring')
    revalidatePath('/')
    revalidatePath('/dashboard')
  }

  async function onArchive(formData: FormData) {
    'use server'
    const id = Number(formData.get('id'))
    await archiveRecurringTask(id)
    revalidatePath('/recurring')
    revalidatePath('/')
    revalidatePath('/dashboard')
  }

  const showNew = sp.action === 'new'
  const editId = sp.action === 'edit' && sp.id ? Number(sp.id) : null
  const editTask = editId ? allTasks.find((t) => t.id === editId) : null

  const dailyCount = allTasks.filter((t) => t.cadence === 'daily').length
  const weeklyCount = allTasks.filter((t) => t.cadence === 'weekly').length

  function ToggleCard({
    task, done, dateForUndo, dateForDone,
  }: {
    task: { id: number; title: string; color: string }
    done: boolean
    dateForUndo: string
    dateForDone: string
  }) {
    return (
      <div className={cn('px-4 py-3 flex items-center gap-3', done && 'opacity-60')}>
        {done ? (
          <form action={onMarkUndone} className="flex-shrink-0">
            <input type="hidden" name="taskId" value={task.id} />
            <input type="hidden" name="date" value={dateForUndo} />
            <button
              type="submit"
              className="w-[22px] h-[22px] rounded-full bg-green-600 flex items-center justify-center hover:bg-green-700 transition-colors"
              aria-label="완료 취소"
            >
              <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} aria-hidden />
            </button>
          </form>
        ) : (
          <form action={onMarkDone} className="flex-shrink-0">
            <input type="hidden" name="taskId" value={task.id} />
            <input type="hidden" name="date" value={dateForDone} />
            <button
              type="submit"
              className="w-[22px] h-[22px] rounded-full border-2 border-muted-foreground/40 hover:border-foreground transition-colors"
              aria-label="완료로 표시"
            />
          </form>
        )}
        <span
          className="w-[5px] h-9 rounded-full flex-shrink-0"
          style={{ background: task.color }}
          aria-hidden
        />
        <span
          className={cn(
            'flex-1 text-[15px] font-medium',
            done && 'line-through decoration-muted-foreground/40',
          )}
        >
          {task.title}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1 flex items-end justify-between gap-2">
        <div>
          <h1 className="text-[30px] leading-tight font-bold tracking-tight">매일 할 일</h1>
          <div className="text-sm text-muted-foreground mt-0.5">
            매일 {dailyCount}개 · 매주 {weeklyCount}개
          </div>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1">
          이번 주 매주 할 일
        </h2>
        {weekTasks.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground text-sm">
            이번 주에 할 일이 없어요
          </Card>
        ) : (
          <Card className="p-0 gap-0 divide-y divide-foreground/10">
            {weekTasks.map((t) => (
              <ToggleCard
                key={t.id}
                task={{ id: t.id, title: t.title, color: t.color }}
                done={t.doneAt !== null}
                dateForUndo={todayIso}
                dateForDone={todayIso}
              />
            ))}
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1">
          오늘의 매일 할 일
        </h2>
        {todayTasks.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground text-sm">
            오늘은 매일 할 일이 없어요
          </Card>
        ) : (
          <Card className="p-0 gap-0 divide-y divide-foreground/10">
            {todayTasks.map((t) => (
              <ToggleCard
                key={t.id}
                task={{ id: t.id, title: t.title, color: t.color }}
                done={t.doneAt !== null}
                dateForUndo={todayIso}
                dateForDone={todayIso}
              />
            ))}
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between px-1 pt-1">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            전체 매일 할 일
          </h2>
          {!showNew && !editId && (
            <Link
              href="/recurring?action=new"
              className={cn(buttonVariants({ size: 'sm' }))}
            >
              + 새 할 일
            </Link>
          )}
        </div>

        {showNew && (
          <RecurringForm
            submitLabel="추가"
            onSubmit={async (input) => {
              'use server'
              return createRecurringTask(input)
            }}
          />
        )}

        {allTasks.length === 0 && !showNew ? (
          <Card className="p-6 text-center text-muted-foreground text-sm border-dashed">
            등록된 매일 할 일이 없습니다.
          </Card>
        ) : (
          <Card className="p-0 gap-0 divide-y divide-foreground/10">
            {allTasks.map((t) => {
              const isEditing = editId === t.id
              if (isEditing && editTask) {
                return (
                  <div key={t.id} className="p-4">
                    <RecurringForm
                      initial={{
                        title: editTask.title,
                        notes: editTask.notes ?? undefined,
                        color: editTask.color,
                        cadence: editTask.cadence,
                        daysOfWeek: editTask.daysOfWeek as DayKey[],
                      }}
                      submitLabel="저장"
                      onSubmit={async (input) => {
                        'use server'
                        return updateRecurringTask(t.id, input)
                      }}
                    />
                  </div>
                )
              }
              const days = (t.daysOfWeek as DayKey[]).map((d) => DAY_KO[d]).join(' · ')
              const isWeekly = t.cadence === 'weekly'
              return (
                <div key={t.id} className="px-4 py-3 flex items-center gap-3">
                  <span
                    className="w-[5px] h-9 rounded-full flex-shrink-0"
                    style={{ background: t.color }}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1.5">
                      <span className={cn(
                        'px-2 py-0.5 rounded-full font-medium text-[10px]',
                        isWeekly
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-muted text-muted-foreground',
                      )}>
                        🔁 {isWeekly ? '이번 주 안에' : '매일'}
                      </span>
                      {!isWeekly && <span className="truncate">{days}</span>}
                    </div>
                  </div>
                  <Link
                    href={`/recurring?action=edit&id=${t.id}`}
                    className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
                  >
                    편집
                  </Link>
                  <form action={onArchive}>
                    <input type="hidden" name="id" value={t.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
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
    </div>
  )
}
