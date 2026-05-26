'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { archiveRecurringTask } from '@/server/actions/recurring'
import { ItemActionsMenu } from '@/components/item-actions-menu'
import { EditRecurringDialog } from '@/components/edit-recurring-dialog'

type DayKey = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'

export type RecurringItemProps = {
  id: number
  title: string
  notes: string | null
  color: string
  cadence: 'daily' | 'weekly'
  daysOfWeek: DayKey[]
  dateIso: string
  onComplete: (formData: FormData) => Promise<void>
}

export function RecurringItem({
  id,
  title,
  notes,
  color,
  cadence,
  daysOfWeek,
  dateIso,
  onComplete,
}: RecurringItemProps) {
  const [editOpen, setEditOpen] = useState(false)

  async function handleArchive() {
    // ItemActionsMenu.runAction already wraps in startTransition + catches errors.
    await archiveRecurringTask(id)
  }

  const badgeClass = cadence === 'weekly'
    ? 'bg-violet-100 text-violet-700'
    : 'bg-muted text-muted-foreground'

  const rowContent = (
    <div className="px-4 py-3 flex items-center gap-3">
      <form action={onComplete} className="flex-shrink-0">
        <input type="hidden" name="taskId" value={id} />
        <input type="hidden" name="dateIso" value={dateIso} />
        <button
          type="submit"
          className="flex items-center justify-center min-h-[44px] min-w-[44px] -mx-2.5 -my-3"
          aria-label="완료로 표시"
        >
          <span className="w-[22px] h-[22px] rounded-full border-2 border-muted-foreground/40 hover:border-foreground hover:bg-accent transition-colors" />
        </button>
      </form>
      <span
        className="w-[5px] h-9 rounded-full flex-shrink-0"
        style={{ background: color }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-[15px] break-words leading-snug">{title}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
          <span className={cn(
            'inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold',
            badgeClass,
          )}>
            🔁 {cadence === 'weekly' ? '이번 주 안에' : '매일'}
          </span>
        </div>
        {notes && (
          <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words line-clamp-2">
            {notes}
          </div>
        )}
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
        {rowContent}
      </ItemActionsMenu>
      <EditRecurringDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        taskId={id}
        initial={{
          title,
          notes,
          color,
          cadence,
          daysOfWeek,
        }}
      />
    </>
  )
}
