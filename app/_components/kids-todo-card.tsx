'use client'

import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ItemActionsMenu } from '@/components/item-actions-menu'
import { EditHomeworkDialog } from '@/components/edit-homework-dialog-lazy'
import { useToast } from '@/components/toast'
import { deferHomework, deleteHomeworkItem, pinHomeworkToDate, unpinHomework } from '@/server/actions/homework'
import { StarFly } from './star-fly'

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
  id, title, academyName, academyColor, dueDate, pinnedDate, todayIso, onComplete,
}: {
  id: number
  title: string
  academyName: string
  academyColor: string
  dueDate: string | null
  // 미리 보기 핀 — 있으면 카드에 📌 노출, 메뉴에 unpin 옵션.
  pinnedDate?: string | null
  todayIso: string
  /**
   * 완료 토글 핸들러. 아이홈/대시보드에서만 전달; 다른 페이지(예: day/[date])는
   * 생략하면 display-only 카드로 렌더됨.
   */
  onComplete?: (formData: FormData) => Promise<void>
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [flying, setFlying] = useState(false)
  const checkRef = useRef<HTMLSpanElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const due = dueLabelOf(dueDate, todayIso)
  const overdue = dueDate !== null && diffDays(dueDate, todayIso) < 0
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
  // 5초 지연 패턴: 클릭하면 카드 즉시 숨김 + 토스트. 토스트 만료 또는
  // 페이지 이동 시 onCommit에서 진짜 server 삭제. 취소하면 카드 복귀.
  async function handleDelete() {
    setHidden(true)
    toast.show({
      label: `"${title}" 삭제`,
      onUndo: () => { setHidden(false) },
      onCommit: async () => { await deleteHomeworkItem(id) },
    })
  }

  if (hidden) return null

  // 아이홈(완료 버튼)에서는 동그라미 체크박스 노출, day 페이지(display-only)에서는 생략.
  const cardBody = (
    <>
      <span
        className="w-[5px] h-10 rounded-full flex-shrink-0"
        style={{ background: academyColor }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        {/* 숙제 제목만 키움 (academy/due 메타는 그대로). 세로·가로 모두 20px. */}
        <div className="font-medium text-[20px] break-words leading-snug">
          {title}
          {pinnedDate && <span className="ml-1.5 text-[17px]" aria-label="미리 보기 핀">📌</span>}
        </div>
        <div className="text-[13px] text-muted-foreground mt-0.5">
          {academyName}
          {due && (
            <>
              <span className="mx-1">·</span>
              <span className={cn(overdue && 'text-destructive font-medium')}>{due}</span>
            </>
          )}
        </div>
      </div>
    </>
  )

  const inner = onComplete ? (
    <form ref={formRef} action={onComplete} className="block relative">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        onClick={(e) => {
          // 즉시 submit하면 페이지 reload가 fly를 잘라먹음.
          // fly가 끝난 후 onArrive에서 requestSubmit() → 모든 별이 끝까지 보임.
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
        {cardBody}
      </button>
      {flying && (
        <StarFly
          originRef={checkRef}
          onArrive={() => formRef.current?.requestSubmit()}
        />
      )}
    </form>
  ) : (
    <div
      className={cn(
        'p-3 pr-12 rounded-xl bg-card ring-1 ring-foreground/10',
        'flex items-center gap-3 min-h-[76px]',
      )}
    >
      {cardBody}
    </div>
  )

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
