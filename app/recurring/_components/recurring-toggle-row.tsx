'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { archiveRecurringTask, unarchiveRecurringTask } from '@/server/actions/recurring'
import { ItemActionsMenu } from '@/components/item-actions-menu'
import { EditRecurringDialog } from '@/components/edit-recurring-dialog-lazy'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/utils'

type Cadence = 'daily' | 'weekly'
type DayKey = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'

const DAY_KO: Record<DayKey, string> = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' }
const DAY_ORDER: DayKey[] = ['mon','tue','wed','thu','fri','sat','sun']

/** daily 스케줄을 한국어 라벨로. 7일 전부(또는 미지정)면 '매일', 아니면 '월·수·금'. */
function dailyScheduleLabel(days: DayKey[] | undefined): string {
  if (!days || days.length === 0 || days.length === 7) return '매일'
  return DAY_ORDER.filter((d) => days.includes(d)).map((d) => DAY_KO[d]).join('·')
}

/**
 * Recurring task 한 줄. 완료 토글은 아이홈/대시보드 전용이므로 여기서는
 * 표시만 (체크박스 클릭 X). 매일/매주 cadence 배지 + ⋮ 메뉴(수정/보관).
 */
export function RecurringToggleRow({
  id, title, color, cadence, done, notes, daysOfWeek,
}: {
  id: number
  title: string
  color: string
  cadence: Cadence
  done: boolean
  notes: string | null
  daysOfWeek?: DayKey[]
}) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const toast = useToast()

  async function handleArchive() {
    await archiveRecurringTask(id)
    router.refresh()
    toast.show({
      label: `"${title}" 보관됨`,
      onUndo: async () => { await unarchiveRecurringTask(id); router.refresh() },
    })
  }

  const isWeekly = cadence === 'weekly'
  const cadenceBadge = (
    <span className={cn(
      'inline-block px-2 py-0.5 rounded-full font-medium text-[10px]',
      isWeekly ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground',
    )}>
      🔁 {isWeekly ? '이번 주 안에' : dailyScheduleLabel(daysOfWeek)}
    </span>
  )

  const inner = (
    <div className={cn('px-4 py-3 pr-12 flex items-center gap-3', done && 'opacity-60')}>
      <span
        className="w-[5px] h-9 rounded-full flex-shrink-0"
        style={{ background: color }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className={cn(
          'text-[15px] font-medium break-words leading-snug',
          done && 'line-through decoration-muted-foreground/40',
        )}>
          {title}
        </div>
        <div className="mt-0.5">{cadenceBadge}</div>
      </div>
    </div>
  )

  return (
    <>
      <ItemActionsMenu
        itemKind="recurring"
        onEdit={() => setEditOpen(true)}
        onArchive={handleArchive}
      >
        {inner}
      </ItemActionsMenu>
      <EditRecurringDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        taskId={id}
        initial={{ title, notes, color, cadence, daysOfWeek: daysOfWeek ?? [] }}
      />
    </>
  )
}
