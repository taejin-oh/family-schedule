import {
  listTodayRecurring,
  listThisWeekRecurring,
  createRecurringTask,
} from '@/server/actions/recurring'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { RecurringForm } from './_components/recurring-form'
import { RecurringToggleRow } from './_components/recurring-toggle-row'

type DayKey = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>
}) {
  const sp = await searchParams
  const [todayTasks, weekTasks] = await Promise.all([
    listTodayRecurring(),
    listThisWeekRecurring(),
  ])

  const showNew = sp.action === 'new'

  const dailyCount = todayTasks.length
  const weeklyCount = weekTasks.length

  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1 flex items-end justify-between gap-2">
        <div>
          <h1 className="text-[30px] leading-tight font-bold tracking-tight">매일/매주 할 일</h1>
          <div className="text-sm text-muted-foreground mt-0.5">
            오늘 매일 {dailyCount}개 · 이번 주 매주 {weeklyCount}개
          </div>
        </div>
        {!showNew && (
          <Link
            href="/recurring?action=new"
            className={cn(buttonVariants({ size: 'sm' }))}
          >
            + 새 할 일
          </Link>
        )}
      </header>

      {showNew && (
        <RecurringForm
          submitLabel="추가"
          onSubmit={async (input) => {
            'use server'
            return createRecurringTask(input)
          }}
        />
      )}

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
              <RecurringToggleRow
                key={t.id}
                id={t.id}
                title={t.title}
                color={t.color}
                cadence={t.cadence}
                done={t.doneAt !== null}
                notes={t.notes}
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
              <RecurringToggleRow
                key={t.id}
                id={t.id}
                title={t.title}
                color={t.color}
                cadence={t.cadence}
                done={t.doneAt !== null}
                notes={t.notes}
                daysOfWeek={t.daysOfWeek as DayKey[]}
              />
            ))}
          </Card>
        )}
      </section>
    </div>
  )
}
