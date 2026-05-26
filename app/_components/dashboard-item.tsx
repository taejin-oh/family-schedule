'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMultiSelect } from './multi-select-bar'
import { deferHomework, deleteHomeworkItem } from '@/server/actions/homework'
import { ItemActionsMenu } from '@/components/item-actions-menu'
import { EditHomeworkDialog } from '@/components/edit-homework-dialog'

type DuePillProps = {
  label: string
  bucket: string
}

function DuePill({ label, bucket }: DuePillProps) {
  const cls =
    bucket === 'overdue'
      ? 'bg-destructive/15 text-destructive border-destructive/30'
      : bucket === 'today'
        ? 'bg-amber-100 text-amber-800 border-amber-300'
        : bucket === 'tomorrow'
          ? 'bg-blue-50 text-blue-800 border-blue-200'
          : 'bg-muted/60 text-muted-foreground border-foreground/10'
  return (
    <span className={cn('inline-block px-1.5 py-0.5 rounded-full text-xs border font-medium', cls)}>
      {label}
    </span>
  )
}

export type HomeworkItemProps = {
  id: number
  title: string
  notes: string | null
  dueDate: string | null
  academyName: string
  academyColor: string
  dueLabel: string | null
  bucket: string
  onComplete: (formData: FormData) => Promise<void>
}

export function HomeworkItem({
  id,
  title,
  notes,
  dueDate,
  academyName,
  academyColor,
  dueLabel,
  bucket,
  onComplete,
}: HomeworkItemProps) {
  const multiSelect = useMultiSelect()
  const isMultiActive = multiSelect?.active ?? false
  const isChecked = multiSelect?.selected.has(id) ?? false
  const [editOpen, setEditOpen] = useState(false)

  async function handleDefer(newDate: string) {
    await deferHomework(id, newDate)
  }

  async function handleDelete() {
    // ItemActionsMenu.runAction already wraps in startTransition.
    await deleteHomeworkItem(id)
  }

  const rowContent = (
    <div
      className={cn('px-4 py-3 flex items-center gap-3', isMultiActive && isChecked && 'bg-accent/40')}
      onClick={isMultiActive ? () => multiSelect?.toggle(id) : undefined}
      role={isMultiActive ? 'checkbox' : undefined}
      aria-checked={isMultiActive ? isChecked : undefined}
    >
      {isMultiActive ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); multiSelect?.toggle(id) }}
          className={cn(
            'w-[22px] h-[22px] rounded flex-shrink-0 border-2 transition-colors flex items-center justify-center',
            isChecked
              ? 'bg-foreground border-foreground text-background'
              : 'border-muted-foreground/40 hover:border-foreground'
          )}
          aria-label={isChecked ? '선택 해제' : '선택'}
        >
          {isChecked && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
        </button>
      ) : (
        <form action={onComplete} className="flex-shrink-0">
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="flex items-center justify-center min-h-[44px] min-w-[44px] -mx-2.5 -my-3"
            aria-label="완료로 표시"
          >
            <span className="w-[22px] h-[22px] rounded-full border-2 border-muted-foreground/40 hover:border-foreground hover:bg-accent transition-colors" />
          </button>
        </form>
      )}
      <span
        className="w-[5px] h-9 rounded-full flex-shrink-0"
        style={{ background: academyColor }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-[15px] break-words leading-snug">{title}</div>
        <div className="flex items-center flex-wrap gap-1.5 text-xs text-muted-foreground mt-0.5">
          <span>{academyName}</span>
          {dueLabel && (
            <>
              <span>·</span>
              <DuePill label={dueLabel} bucket={bucket} />
            </>
          )}
        </div>
        {notes && (
          <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words line-clamp-2">
            {notes}
          </div>
        )}
      </div>
    </div>
  )

  if (isMultiActive) {
    return rowContent
  }

  return (
    <>
      <ItemActionsMenu
        itemKind="homework"
        currentDueDate={dueDate}
        onEdit={() => setEditOpen(true)}
        onDefer={handleDefer}
        onDelete={handleDelete}
      >
        {rowContent}
      </ItemActionsMenu>
      <EditHomeworkDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        itemId={id}
        initialTitle={title}
        initialNotes={notes}
        initialDueDate={dueDate}
      />
    </>
  )
}
