'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { toggleItemDone } from '@/server/actions/homework'
import { cn } from '@/lib/utils'
import { DeferMenu } from '@/components/defer-menu'

type Item = {
  id: number
  title: string
  notes: string | null
  dueDate: string | null
  doneAt: Date | null
}

type BucketStyle = 'overdue' | 'today' | 'tomorrow' | 'other'

function diffDays(due: string, todayIso: string): number {
  const t = new Date(todayIso + 'T00:00:00')
  const d = new Date(due + 'T00:00:00')
  return Math.round((d.getTime() - t.getTime()) / 86_400_000)
}

function duePillStyle(due: string | null, todayIso: string): BucketStyle {
  if (!due) return 'other'
  const dd = diffDays(due, todayIso)
  if (dd < 0) return 'overdue'
  if (dd === 0) return 'today'
  if (dd === 1) return 'tomorrow'
  return 'other'
}

function formatDueLabel(due: string | null, todayIso: string): string | null {
  if (!due) return null
  const dd = diffDays(due, todayIso)
  if (dd < 0) return `${Math.abs(dd)}일 지남`
  if (dd === 0) return '오늘'
  if (dd === 1) return '내일'
  if (dd <= 7) return `${dd}일 후`
  return due
}

function formatRelative(doneAt: Date, now: number): string {
  const diffMs = now - doneAt.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) {
    const h = doneAt.getHours()
    const m = doneAt.getMinutes()
    const ampm = h < 12 ? '오전' : '오후'
    const hh = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${ampm} ${hh}:${String(m).padStart(2, '0')}`
  }
  return `${Math.floor(diffHr / 24)}일 전`
}

function DuePill({ due, todayIso }: { due: string; todayIso: string }) {
  const style = duePillStyle(due, todayIso)
  const label = formatDueLabel(due, todayIso)
  if (!label) return null
  const cls =
    style === 'overdue'
      ? 'bg-destructive/15 text-destructive border-destructive/30'
      : style === 'today'
        ? 'bg-amber-100 text-amber-800 border-amber-300'
        : style === 'tomorrow'
          ? 'bg-blue-50 text-blue-800 border-blue-200'
          : 'bg-muted text-muted-foreground border-foreground/10'
  return (
    <span className={cn('inline-block px-1.5 py-0.5 rounded-full text-xs border font-medium', cls)}>
      {label}
    </span>
  )
}

export function ActiveAcademyItems({
  items,
  todayIso,
}: {
  items: Item[]
  todayIso: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  function markDone(id: number, done: boolean) {
    startTransition(async () => {
      await toggleItemDone(id, done)
      router.refresh()
    })
  }

  if (items.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center rounded-xl ring-1 ring-foreground/10 bg-card">
        진행 중인 숙제가 없습니다.
      </div>
    )
  }

  return (
    <div className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-hidden divide-y">
      {items.map((it) => (
        <div key={it.id} className="p-3 flex items-start gap-3">
          <button
            type="button"
            onClick={() => markDone(it.id, true)}
            className="mt-0.5 w-6 h-6 rounded-full border-2 border-muted-foreground hover:border-foreground hover:bg-accent transition-colors flex items-center justify-center flex-shrink-0"
            aria-label="완료로 표시"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <div className="font-medium break-words">{it.title}</div>
              <DeferMenu itemId={it.id} currentDueDate={it.dueDate} />
            </div>
            <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
              {it.dueDate && (
                <DuePill due={it.dueDate} todayIso={todayIso} />
              )}
            </div>
            {it.notes && (
              <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words line-clamp-3">
                {it.notes}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export function DoneAcademyItems({
  items,
  now,
}: {
  items: Item[]
  now: number
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  function markUndone(id: number) {
    startTransition(async () => {
      await toggleItemDone(id, false)
      router.refresh()
    })
  }

  if (items.length === 0) return null

  return (
    <details className="group rounded-xl ring-1 ring-foreground/10 bg-card overflow-hidden">
      <summary className="cursor-pointer select-none flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/40 transition-colors">
        <span className="flex items-center gap-2">
          <Check className="h-4 w-4 text-green-600" aria-hidden />
          완료한 숙제 ({items.length})
        </span>
        <span className="text-xs text-muted-foreground group-open:hidden">펼치기</span>
        <span className="text-xs text-muted-foreground hidden group-open:inline">접기</span>
      </summary>
      <div className="divide-y border-t">
        {items.map((it) => (
          <div key={it.id} className="p-3 flex items-start gap-3 opacity-60 hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => markUndone(it.id)}
              className="mt-0.5 w-6 h-6 rounded-full bg-green-600 flex items-center justify-center hover:ring-2 hover:ring-red-400 hover:ring-offset-1 transition-all flex-shrink-0"
              aria-label="완료 취소"
            >
              <Check className="h-3.5 w-3.5 text-white" aria-hidden />
            </button>
            <div className="flex-1 min-w-0">
              <div className="font-medium break-words line-through decoration-muted-foreground/40">
                {it.title}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {it.dueDate && <>~{it.dueDate} · </>}
                {it.doneAt && <>{formatRelative(it.doneAt, now)} 완료</>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}
