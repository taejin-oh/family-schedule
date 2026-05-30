'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMultiSelect } from './multi-select-bar'
import { deferHomework, deleteHomeworkItem, pinHomeworkToDate, unpinHomework } from '@/server/actions/homework'
import { ItemActionsMenu } from '@/components/item-actions-menu'
import { EditHomeworkDialog } from '@/components/edit-homework-dialog-lazy'
import { useToast } from '@/components/toast'

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
          ? 'bg-brand/10 text-brand border-brand/25'
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
  // 미리 보기 핀 날짜. set 되어 있으면 카드에 📌 표시 + 메뉴 토글이 unpin 으로 전환.
  pinnedDate?: string | null
  academyName: string
  academyColor: string
  dueLabel: string | null
  bucket: string
  // active 카드 (기본): 빈 원 체크 → 완료 표시
  onComplete?: (formData: FormData) => Promise<void>
  // done variant: 체크박스 = 초록 ✓ + 클릭 시 완료 취소.
  done?: boolean
  doneRelativeLabel?: string | null
  onUndo?: (formData: FormData) => Promise<void>
}

export function HomeworkItem({
  id,
  title,
  notes,
  dueDate,
  pinnedDate,
  academyName,
  academyColor,
  dueLabel,
  bucket,
  onComplete,
  done = false,
  doneRelativeLabel,
  onUndo,
}: HomeworkItemProps) {
  const multiSelect = useMultiSelect()
  const isMultiActive = multiSelect?.active ?? false
  const isChecked = multiSelect?.selected.has(id) ?? false
  const [editOpen, setEditOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const toast = useToast()

  async function handleDefer(newDate: string) {
    await deferHomework(id, newDate)
  }
  async function handlePin(dateIso: string) {
    await pinHomeworkToDate(id, dateIso)
  }
  async function handleUnpin() {
    await unpinHomework(id)
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

  const rowContent = (
    <div
      className={cn(
        'px-4 py-3 pr-12 flex items-center gap-3',
        isMultiActive && isChecked && 'bg-accent/40',
        done && !isMultiActive && 'opacity-60 hover:opacity-100 transition-opacity',
      )}
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
      ) : done ? (
        <form action={onUndo} className="flex-shrink-0">
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="flex items-center justify-center min-h-[44px] min-w-[44px] -mx-2.5 -my-3"
            aria-label="완료 취소"
          >
            <span className="w-[22px] h-[22px] rounded-full bg-green-600 flex items-center justify-center hover:ring-2 hover:ring-red-400 hover:ring-offset-1 transition-all">
              <Check className="h-3 w-3 text-white" strokeWidth={3} aria-hidden />
            </span>
          </button>
        </form>
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
        <div className={cn(
          // 가로모드에선 숙제 제목만 키움 (설명/메타는 그대로). landscape = orientation 기반.
          'font-medium text-[15px] landscape:text-[18px] break-words leading-snug',
          done && 'line-through decoration-muted-foreground/40',
        )}>{title}</div>
        <div className="flex items-center flex-wrap gap-1.5 text-xs text-muted-foreground mt-0.5">
          <span>{academyName}</span>
          {done && doneRelativeLabel && (
            <>
              <span>·</span>
              <span>{doneRelativeLabel} 완료</span>
            </>
          )}
          {!done && dueLabel && (
            <>
              <span>·</span>
              <DuePill label={dueLabel} bucket={bucket} />
            </>
          )}
          {!done && pinnedDate && (
            <>
              <span>·</span>
              <span className="text-xs" aria-label="미리 보기 핀">📌</span>
            </>
          )}
        </div>
        {notes && !done && (
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
        pinnedDate={pinnedDate ?? null}
        onEdit={() => setEditOpen(true)}
        onDefer={handleDefer}
        onDelete={handleDelete}
        onPin={handlePin}
        onUnpin={handleUnpin}
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
