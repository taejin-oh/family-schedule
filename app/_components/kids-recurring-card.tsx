'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ItemActionsMenu } from '@/components/item-actions-menu'
import { EditRecurringDialog } from '@/components/edit-recurring-dialog'
import { archiveRecurringTask } from '@/server/actions/recurring'

type DayKey = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'
type Cadence = 'daily' | 'weekly'

type CommonProps = {
  id: number
  title: string
  color: string
  cadence: Cadence
  dateIso: string
  notes?: string | null
  daysOfWeek?: DayKey[]
}

export function KidsRecurringTodoCard({
  id, title, color, cadence, dateIso, notes, daysOfWeek,
  onComplete,
}: CommonProps & { onComplete: (formData: FormData) => Promise<void> }) {
  const [editOpen, setEditOpen] = useState(false)
  async function handleArchive() {
    await archiveRecurringTask(id)
  }
  const cadenceLabel = cadence === 'weekly' ? '매주' : '매일'

  const inner = (
    <form action={onComplete} className="block">
      <input type="hidden" name="taskId" value={id} />
      <input type="hidden" name="dateIso" value={dateIso} />
      <button
        type="submit"
        className={cn(
          'w-full text-left p-3 rounded-xl bg-card ring-1 ring-foreground/10',
          'hover:bg-accent/40 active:bg-accent/60 transition-colors',
          'flex items-center gap-3 min-h-[64px]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span
          className="w-[22px] h-[22px] rounded-full border-2 border-muted-foreground/40 flex-shrink-0"
          aria-hidden
        />
        <span
          className="w-[5px] h-9 rounded-full flex-shrink-0"
          style={{ background: color }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-[15px] break-words leading-snug">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">🔁 {cadenceLabel}</div>
        </div>
      </button>
    </form>
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
        initial={{ title, notes: notes ?? null, color, cadence, daysOfWeek: daysOfWeek ?? [] }}
      />
    </>
  )
}

export function KidsRecurringDoneCard({
  id, title, color, cadence, dateIso, onUndo,
}: {
  id: number
  title: string
  color: string
  cadence: Cadence
  dateIso: string
  onUndo: (formData: FormData) => Promise<void>
}) {
  const checkBg = cadence === 'weekly' ? 'bg-violet-600' : 'bg-green-600'

  return (
    <form action={onUndo} className="block">
      <input type="hidden" name="taskId" value={id} />
      <input type="hidden" name="dateIso" value={dateIso} />
      <button
        type="submit"
        className={cn(
          'w-full text-left p-3 rounded-xl bg-card ring-1 ring-foreground/10',
          'hover:bg-accent/40 active:bg-accent/60 transition-colors',
          'flex items-center gap-3 min-h-[64px] opacity-70 hover:opacity-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span className={cn('w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0', checkBg)} aria-hidden>
          <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
        </span>
        <span
          className="w-[5px] h-9 rounded-full flex-shrink-0"
          style={{ background: color }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-[15px] break-words line-through decoration-muted-foreground/50">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">🔁 {cadence === 'weekly' ? '매주' : '매일'}</div>
        </div>
      </button>
    </form>
  )
}
