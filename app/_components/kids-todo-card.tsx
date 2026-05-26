'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ItemActionsMenu } from '@/components/item-actions-menu'
import { EditHomeworkDialog } from '@/components/edit-homework-dialog'
import { deferHomework, deleteHomeworkItem } from '@/server/actions/homework'

function diffDays(due: string, todayIso: string): number {
  const t = new Date(todayIso + 'T00:00:00')
  const d = new Date(due + 'T00:00:00')
  return Math.round((d.getTime() - t.getTime()) / 86_400_000)
}

function dueLabelOf(due: string | null, todayIso: string): string | null {
  if (!due) return null
  const dd = diffDays(due, todayIso)
  if (dd < 0) return `${Math.abs(dd)}일 지남`
  if (dd === 0) return '오늘까지'
  if (dd === 1) return '내일까지'
  return `${dd}일 후`
}

export function KidsTodoCard({
  id, title, academyName, academyColor, dueDate, todayIso, onComplete,
}: {
  id: number
  title: string
  academyName: string
  academyColor: string
  dueDate: string | null
  todayIso: string
  onComplete: (formData: FormData) => Promise<void>
}) {
  const [editOpen, setEditOpen] = useState(false)
  const due = dueLabelOf(dueDate, todayIso)
  const overdue = dueDate !== null && diffDays(dueDate, todayIso) < 0

  async function handleDefer(newDate: string) {
    await deferHomework(id, newDate)
  }
  async function handleDelete() {
    await deleteHomeworkItem(id)
  }

  const inner = (
    <form action={onComplete} className="block">
      <input type="hidden" name="id" value={id} />
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
          style={{ background: academyColor }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-[15px] break-words leading-snug">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {academyName}
            {due && (
              <>
                <span className="mx-1">·</span>
                <span className={cn(overdue && 'text-destructive font-medium')}>{due}</span>
              </>
            )}
          </div>
        </div>
      </button>
    </form>
  )

  return (
    <>
      <ItemActionsMenu
        itemKind="homework"
        currentDueDate={dueDate}
        onEdit={() => setEditOpen(true)}
        onDefer={handleDefer}
        onDelete={handleDelete}
      >
        {inner}
      </ItemActionsMenu>
      <EditHomeworkDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        itemId={id}
        initialTitle={title}
        initialNotes={null}
        initialDueDate={dueDate}
      />
    </>
  )
}
