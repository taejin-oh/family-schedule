'use client'

import { useState, useRef } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMultiSelect } from './multi-select-bar'

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
  /** bound server action: complete */
  onComplete: (formData: FormData) => Promise<void>
  /** bound server action: save inline edit */
  onSave: (formData: FormData) => Promise<void>
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
  onSave,
}: HomeworkItemProps) {
  const multiSelect = useMultiSelect()
  const isMultiActive = multiSelect?.active ?? false
  const isChecked = multiSelect?.selected.has(id) ?? false

  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(title)
  const [editDue, setEditDue] = useState(dueDate ?? '')
  const formRef = useRef<HTMLFormElement>(null)

  function startEdit() {
    setEditTitle(title)
    setEditDue(dueDate ?? '')
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
  }

  async function handleSave() {
    if (!formRef.current) return
    const fd = new FormData(formRef.current)
    await onSave(fd)
    setEditing(false)
  }

  return (
    <div
      className={cn('p-3 flex items-start gap-3', isMultiActive && isChecked && 'bg-accent/40')}
      onClick={isMultiActive ? () => multiSelect?.toggle(id) : undefined}
      role={isMultiActive ? 'checkbox' : undefined}
      aria-checked={isMultiActive ? isChecked : undefined}
    >
      {/* In multi-select mode show a checkbox; otherwise show the complete button */}
      {isMultiActive ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); multiSelect?.toggle(id) }}
          className={cn(
            'mt-0.5 w-6 h-6 rounded flex-shrink-0 border-2 transition-colors flex items-center justify-center',
            isChecked
              ? 'bg-foreground border-foreground text-background'
              : 'border-muted-foreground hover:border-foreground'
          )}
          aria-label={isChecked ? '선택 해제' : '선택'}
        >
          {isChecked && <Check className="h-3.5 w-3.5" aria-hidden />}
        </button>
      ) : (
        <form action={onComplete} className="flex-shrink-0">
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="mt-0.5 w-6 h-6 rounded-full border-2 border-muted-foreground hover:border-foreground hover:bg-accent transition-colors flex items-center justify-center"
            aria-label="완료로 표시"
          />
        </form>
      )}
      <span
        className="mt-2 w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ background: academyColor }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        {editing ? (
          <form ref={formRef} className="space-y-1.5">
            <input type="hidden" name="id" value={id} />
            <input
              name="title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full text-sm font-medium bg-background border border-input rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
            <input
              name="dueDate"
              type="date"
              value={editDue}
              onChange={(e) => setEditDue(e.target.value)}
              className="w-full text-xs bg-background border border-input rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleSave}
                className="text-xs px-2 py-0.5 rounded bg-foreground text-background hover:bg-foreground/90"
              >
                저장
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="text-xs px-2 py-0.5 rounded text-muted-foreground hover:text-foreground"
              >
                취소
              </button>
            </div>
          </form>
        ) : (
          <>
            <div
              className="font-medium break-words cursor-pointer hover:underline underline-offset-2 decoration-muted-foreground/40"
              onClick={startEdit}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && startEdit()}
              aria-label={`${title} 편집`}
            >
              {title}
            </div>
            <div className="flex items-center flex-wrap gap-1.5 text-xs text-muted-foreground mt-0.5">
              <span>{academyName}</span>
              {dueLabel && (
                <>
                  <span>·</span>
                  <span
                    onClick={startEdit}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer"
                    onKeyDown={(e) => e.key === 'Enter' && startEdit()}
                  >
                    <DuePill label={dueLabel} bucket={bucket} />
                  </span>
                </>
              )}
            </div>
            {notes && (
              <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words line-clamp-3">
                {notes}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
