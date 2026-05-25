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
  }

  async function onMarkUndone(formData: FormData) {
    'use server'
    const taskId = Number(formData.get('taskId'))
    const date = String(formData.get('date'))
    await markRecurringUndone(taskId, date)
    revalidatePath('/recurring')
  }

  async function onArchive(formData: FormData) {
    'use server'
    const id = Number(formData.get('id'))
    await archiveRecurringTask(id)
    revalidatePath('/recurring')
  }

  // Determine if we should show the form (new or edit)
  const showNew = sp.action === 'new'
  const editId = sp.action === 'edit' && sp.id ? Number(sp.id) : null
  const editTask = editId ? allTasks.find((t) => t.id === editId) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">매일 할 일</h1>
      </div>

      {/* 이번 주 할 일 section (weekly cadence) */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground px-1">이번 주 할 일</h2>
        {weekTasks.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground text-sm">
            이번 주에 할 일이 없어요
          </Card>
        ) : (
          <Card className="p-0 divide-y">
            {weekTasks.map((t) => {
              const done = t.doneAt !== null
              return (
                <div
                  key={t.id}
                  className={cn('p-3 flex items-center gap-3', done && 'opacity-60')}
                >
                  {done ? (
                    <form action={onMarkUndone} className="flex-shrink-0">
                      <input type="hidden" name="taskId" value={t.id} />
                      <input type="hidden" name="date" value={todayIso} />
                      <button
                        type="submit"
                        className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center hover:bg-green-700 transition-colors"
                        aria-label="완료 취소"
                      >
                        <Check className="h-3.5 w-3.5 text-white" aria-hidden />
                      </button>
                    </form>
                  ) : (
                    <form action={onMarkDone} className="flex-shrink-0">
                      <input type="hidden" name="taskId" value={t.id} />
                      <input type="hidden" name="date" value={todayIso} />
                      <button
                        type="submit"
                        className="w-6 h-6 rounded-full border-2 border-muted-foreground hover:border-foreground hover:bg-accent transition-colors"
                        aria-label="완료로 표시"
                      />
                    </form>
                  )}
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: t.color }}
                    aria-hidden
                  />
                  <span className={cn('flex-1 font-medium', done && 'line-through decoration-muted-foreground/40')}>
                    {t.title}
                  </span>
                </div>
              )
            })}
          </Card>
        )}
      </section>

      {/* 오늘 할 일 section */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground px-1">오늘의 매일 할 일</h2>
        {todayTasks.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground text-sm">
            오늘은 매일 할 일이 없어요
          </Card>
        ) : (
          <Card className="p-0 divide-y">
            {todayTasks.map((t) => {
              const done = t.doneAt !== null
              return (
                <div
                  key={t.id}
                  className={cn('p-3 flex items-center gap-3', done && 'opacity-60')}
                >
                  {done ? (
                    <form action={onMarkUndone} className="flex-shrink-0">
                      <input type="hidden" name="taskId" value={t.id} />
                      <input type="hidden" name="date" value={todayIso} />
                      <button
                        type="submit"
                        className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center hover:bg-green-700 transition-colors"
                        aria-label="완료 취소"
                      >
                        <Check className="h-3.5 w-3.5 text-white" aria-hidden />
                      </button>
                    </form>
                  ) : (
                    <form action={onMarkDone} className="flex-shrink-0">
                      <input type="hidden" name="taskId" value={t.id} />
                      <input type="hidden" name="date" value={todayIso} />
                      <button
                        type="submit"
                        className="w-6 h-6 rounded-full border-2 border-muted-foreground hover:border-foreground hover:bg-accent transition-colors"
                        aria-label="완료로 표시"
                      />
                    </form>
                  )}
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: t.color }}
                    aria-hidden
                  />
                  <span className={cn('flex-1 font-medium', done && 'line-through decoration-muted-foreground/40')}>
                    {t.title}
                  </span>
                </div>
              )
            })}
          </Card>
        )}
      </section>

      {/* 전체 목록 section */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-foreground">전체 매일 할 일</h2>
          {!showNew && !editId && (
            <Link
              href="/recurring?action=new"
              className={cn(buttonVariants({ size: 'sm' }))}
            >
              + 새 할 일
            </Link>
          )}
        </div>

        {/* Inline new form */}
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
          <Card className="divide-y p-0">
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
              const days = (t.daysOfWeek as DayKey[]).map((d) => DAY_KO[d]).join('·')
              const isWeekly = t.cadence === 'weekly'
              return (
                <div key={t.id} className="p-4 flex items-center gap-3">
                  <span
                    className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                    style={{ background: t.color }}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium flex items-center gap-2">
                      {t.title}
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full font-medium border',
                        isWeekly
                          ? 'bg-violet-50 text-violet-700 border-violet-200'
                          : 'bg-muted/60 text-muted-foreground border-foreground/10',
                      )}>
                        {isWeekly ? '매주' : '매일'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {isWeekly ? '이번 주 안에 끝내기' : days}
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
