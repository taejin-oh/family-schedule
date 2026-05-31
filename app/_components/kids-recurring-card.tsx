'use client'

import { useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { ItemActionsMenu } from '@/components/item-actions-menu'
import { EditRecurringDialog } from '@/components/edit-recurring-dialog-lazy'
import { useToast } from '@/components/toast'
import { archiveRecurringTask, unarchiveRecurringTask } from '@/server/actions/recurring'
import { StarFly } from './star-fly'

type DoneCardProps = {
  id: number
  title: string
  color: string
  cadence: 'daily' | 'weekly'
  dateIso: string
  notes?: string | null
  daysOfWeek?: ('mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun')[]
  onUndo: (formData: FormData) => Promise<void>
}

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
  const [flying, setFlying] = useState(false)
  const checkRef = useRef<HTMLSpanElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const router = useRouter()
  const toast = useToast()
  async function handleArchive() {
    await archiveRecurringTask(id)
    toast.show({
      label: `"${title}" 보관됨`,
      onUndo: async () => { await unarchiveRecurringTask(id); router.refresh() },
    })
  }
  const cadenceLabel = cadence === 'weekly' ? '매주' : '매일'

  const inner = (
    <form ref={formRef} action={onComplete} className="block relative">
      <input type="hidden" name="taskId" value={id} />
      <input type="hidden" name="dateIso" value={dateIso} />
      <button
        type="submit"
        onClick={(e) => {
          // fly 끝난 후 onArrive에서 submit → 페이지 reload가 fly를 자르지 않음.
          if (!flying) {
            e.preventDefault()
            setFlying(true)
          }
        }}
        className={cn(
          'w-full text-left p-3 pr-12 rounded-xl bg-card ring-1 ring-foreground/10',
          'hover:bg-accent/40 active:bg-accent/60 transition-colors',
          'flex items-center gap-3 min-h-[76px]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span
          ref={checkRef}
          className={cn(
            'w-[24px] h-[24px] rounded-full flex-shrink-0 transition-all duration-200',
            flying
              ? 'bg-reward border-2 border-reward scale-110'
              : 'border-2 border-muted-foreground/40',
          )}
          aria-hidden
        />
        <span
          className="w-[5px] h-10 rounded-full flex-shrink-0"
          style={{ background: color }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-[20px] break-words leading-snug">{title}</div>
          <div className="text-[13px] text-muted-foreground mt-0.5">🔁 {cadenceLabel}</div>
        </div>
      </button>
      {flying && (
        <StarFly
          originRef={checkRef}
          onArrive={() => formRef.current?.requestSubmit()}
        />
      )}
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
  id, title, color, cadence, dateIso, notes, daysOfWeek, onUndo,
}: DoneCardProps) {
  const [editOpen, setEditOpen] = useState(false)
  const checkBg = cadence === 'weekly' ? 'bg-brand' : 'bg-good'
  const router = useRouter()
  const toast = useToast()

  async function handleArchive() {
    await archiveRecurringTask(id)
    toast.show({
      label: `"${title}" 보관됨`,
      onUndo: async () => { await unarchiveRecurringTask(id); router.refresh() },
    })
  }

  const inner = (
    <form action={onUndo} className="block">
      <input type="hidden" name="taskId" value={id} />
      <input type="hidden" name="dateIso" value={dateIso} />
      <button
        type="submit"
        className={cn(
          'w-full text-left p-3 pr-12 rounded-xl bg-card ring-1 ring-foreground/10',
          'hover:bg-accent/40 active:bg-accent/60 transition-colors',
          'flex items-center gap-3 min-h-[76px] opacity-70 hover:opacity-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span className={cn('w-[24px] h-[24px] rounded-full flex items-center justify-center flex-shrink-0', checkBg)} aria-hidden>
          <Check className="h-4 w-4 text-white" strokeWidth={3} />
        </span>
        <span
          className="w-[5px] h-10 rounded-full flex-shrink-0"
          style={{ background: color }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-[20px] break-words line-through decoration-muted-foreground/50">{title}</div>
          <div className="text-[13px] text-muted-foreground mt-0.5">🔁 {cadence === 'weekly' ? '매주' : '매일'}</div>
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
