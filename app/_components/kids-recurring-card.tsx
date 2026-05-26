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
  const badge = cadence === 'weekly' ? '매주' : '매일'
  const badgeClass = cadence === 'weekly'
    ? 'bg-violet-50 text-violet-700 border-violet-200'
    : 'bg-muted/60 text-muted-foreground border-foreground/10'

  const inner = (
    <form action={onComplete} className="block">
      <input type="hidden" name="taskId" value={id} />
      <input type="hidden" name="dateIso" value={dateIso} />
      <button
        type="submit"
        className={cn(
          'w-full text-left p-4 rounded-xl border bg-card hover:bg-accent/40 active:bg-accent/60',
          'transition-colors flex items-center gap-3 min-h-[64px]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span
          className="w-4 h-4 rounded-full flex-shrink-0"
          style={{ background: color }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-base break-words leading-snug">{title}</div>
          <div className="mt-0.5">
            <span className={cn('inline-block px-1.5 py-0.5 rounded-full text-[10px] border font-medium', badgeClass)}>
              🔁 {badge}
            </span>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground flex-shrink-0 leading-tight">
          누르면<br />완료
        </span>
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
          'w-full text-left p-4 rounded-xl border bg-card hover:bg-accent/40 active:bg-accent/60',
          'transition-colors flex items-center gap-3 min-h-[64px] opacity-70 hover:opacity-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0', checkBg)} aria-hidden>
          <Check className="h-4 w-4 text-white" />
        </span>
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ background: color }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium break-words line-through decoration-muted-foreground/50">{title}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">🔁 {cadence === 'weekly' ? '매주' : '매일'}</div>
        </div>
        <span className="text-[10px] text-muted-foreground flex-shrink-0 leading-tight">
          누르면<br />되돌리기
        </span>
      </button>
    </form>
  )
}
