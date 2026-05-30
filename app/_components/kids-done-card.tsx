'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ItemActionsMenu } from '@/components/item-actions-menu'
import { EditHomeworkDialog } from '@/components/edit-homework-dialog-lazy'
import { useToast } from '@/components/toast'
import { deferHomework, deleteHomeworkItem } from '@/server/actions/homework'

export function KidsDoneCard({
  id, title, academyName, academyColor, dueDate, onUndo,
}: {
  id: number
  title: string
  academyName: string
  academyColor: string
  dueDate: string | null
  onUndo: (formData: FormData) => Promise<void>
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const toast = useToast()

  async function handleDefer(newDate: string) {
    await deferHomework(id, newDate)
  }
  async function handleDelete() {
    setHidden(true)
    toast.show({
      label: `"${title}" 삭제`,
      onUndo: () => { setHidden(false) },
      onCommit: async () => { await deleteHomeworkItem(id) },
    })
  }

  if (hidden) return null

  const inner = (
    <form action={onUndo} className="block">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className={cn(
          'w-full text-left p-3 pr-12 rounded-xl bg-card ring-1 ring-foreground/10',
          'hover:bg-accent/40 active:bg-accent/60 transition-colors',
          'flex items-center gap-3 min-h-[76px] opacity-70 hover:opacity-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span
          className="w-[24px] h-[24px] rounded-full bg-good flex items-center justify-center flex-shrink-0"
          aria-hidden
        >
          <Check className="h-4 w-4 text-white" strokeWidth={3} />
        </span>
        <span
          className="w-[5px] h-10 rounded-full flex-shrink-0"
          style={{ background: academyColor }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-[17px] landscape:text-[20px] break-words line-through decoration-muted-foreground/50">{title}</div>
          <div className="text-[13px] text-muted-foreground mt-0.5">{academyName}</div>
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
