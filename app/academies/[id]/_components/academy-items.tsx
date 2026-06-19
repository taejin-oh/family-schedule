'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { deferHomework, deleteHomeworkItem, toggleItemDone } from '@/server/actions/homework'
import { ItemActionsMenu } from '@/components/item-actions-menu'
import { EditHomeworkDialog } from '@/components/edit-homework-dialog-lazy'
import { ScoreChips } from '@/app/_components/score-chips'
import { useScoreSheet } from '@/app/_components/score-sheet'
import { useToast } from '@/components/toast'
import { useMultiSelect } from '@/app/_components/multi-select-bar'
import { diffDays, formatDueLabel } from '@/lib/date'
import { cn } from '@/lib/utils'

type Item = {
  id: number
  title: string
  notes: string | null
  dueDate: string | null
  doneAt: Date | null
  score: '상' | '중' | '하' | null
  scoreReason: string | null
}

type BucketStyle = 'overdue' | 'today' | 'tomorrow' | 'other'

function duePillStyle(due: string | null, todayIso: string): BucketStyle {
  if (!due) return 'other'
  const dd = diffDays(due, todayIso)
  if (dd < 0) return 'overdue'
  if (dd === 0) return 'today'
  if (dd === 1) return 'tomorrow'
  return 'other'
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
  const days = Math.floor(diffHr / 24)
  if (days < 7) return `${days}일 전`
  return `${doneAt.getMonth() + 1}/${doneAt.getDate()}`
}

function DuePill({ due, todayIso }: { due: string; todayIso: string }) {
  const style = duePillStyle(due, todayIso)
  const label = formatDueLabel(due, todayIso)
  if (!label) return null
  const cls =
    style === 'overdue'
      ? 'bg-destructive/15 text-destructive border-destructive/30'
      : style === 'today'
        ? 'bg-reward-soft text-foreground border-reward/40'
        : style === 'tomorrow'
          ? 'bg-brand-soft text-brand border-brand/30'
          : 'bg-muted text-muted-foreground border-foreground/10'
  return (
    <span className={cn('inline-block px-1.5 py-0.5 rounded-full text-xs border font-medium', cls)}>
      {label}
    </span>
  )
}

/** 다중선택 모드에서 행 좌측에 표시되는 체크박스 마커. */
function SelectMarker({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn(
        'mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors',
        selected ? 'bg-primary border-primary' : 'border-muted-foreground/40',
      )}
      aria-hidden
    >
      {selected && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} aria-hidden />}
    </span>
  )
}

// ── Active rows ──────────────────────────────────────────────────────────────

function ActiveRow({ item, todayIso }: { item: Item; todayIso: string }) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const scoreSheet = useScoreSheet()
  const toast = useToast()
  const ms = useMultiSelect()
  const selectMode = ms?.active ?? false
  const isSelected = ms?.selected.has(item.id) ?? false

  async function handleDefer(newDate: string) {
    await deferHomework(item.id, newDate)
    router.refresh()
  }
  // 완료 → 페이지 상단 점수 시트(Provider). 닫힐 때 새로고침으로 완료 목록 이동.
  async function handleComplete() {
    await toggleItemDone(item.id, true)
    scoreSheet?.open(item.id, item.title)
  }
  async function handleDelete() {
    setHidden(true)
    toast.show({
      label: `"${item.title}" 삭제`,
      onUndo: () => { setHidden(false) },
      onCommit: async () => { await deleteHomeworkItem(item.id); router.refresh() },
    })
  }

  if (hidden) return null

  const body = (
    <div className="flex-1 min-w-0">
      <div className="font-medium break-words">{item.title}</div>
      <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
        {item.dueDate && <DuePill due={item.dueDate} todayIso={todayIso} />}
      </div>
      {item.notes && (
        <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words line-clamp-3">
          {item.notes}
        </div>
      )}
    </div>
  )

  if (selectMode) {
    return (
      <button
        type="button"
        onClick={() => ms?.toggle(item.id)}
        className={cn(
          'w-full text-left p-3 flex items-start gap-3 transition-colors',
          isSelected ? 'bg-primary/10' : 'hover:bg-accent/40',
        )}
        aria-pressed={isSelected}
      >
        <SelectMarker selected={isSelected} />
        {body}
      </button>
    )
  }

  return (
    <>
      <ItemActionsMenu
        itemKind="homework"
        currentDueDate={item.dueDate}
        onEdit={() => setEditOpen(true)}
        onDefer={handleDefer}
        onDelete={handleDelete}
      >
        <button
          type="button"
          onClick={handleComplete}
          aria-label={`"${item.title}" 완료`}
          className="w-full text-left p-3 pr-12 flex items-start gap-3 hover:bg-accent/40 active:bg-accent/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className="mt-0.5 w-[22px] h-[22px] rounded-full border-2 border-muted-foreground/40 flex-shrink-0"
            aria-hidden
          />
          {body}
        </button>
      </ItemActionsMenu>
      <EditHomeworkDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        itemId={item.id}
        initialTitle={item.title}
        initialNotes={item.notes}
        initialDueDate={item.dueDate}
      />
    </>
  )
}

export function ActiveAcademyItems({
  items,
  todayIso,
}: {
  items: Item[]
  todayIso: string
}) {
  return (
    <details className="group rounded-xl ring-1 ring-foreground/10 bg-card overflow-hidden" open>
      <summary className="cursor-pointer select-none flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/40 transition-colors">
        <span className="flex items-center gap-2">📚 진행 중인 숙제 ({items.length})</span>
        <span className="text-xs text-muted-foreground group-open:hidden">펼치기</span>
        <span className="text-xs text-muted-foreground hidden group-open:inline">접기</span>
      </summary>
      <div className="border-t">
        {items.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">진행 중인 숙제가 없습니다.</div>
        ) : (
          <div className="divide-y">
            {items.map((it) => (
              <ActiveRow key={it.id} item={it} todayIso={todayIso} />
            ))}
          </div>
        )}
      </div>
    </details>
  )
}

// ── Done rows ────────────────────────────────────────────────────────────────

function DoneRow({ item, now }: { item: Item; now: number }) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const toast = useToast()
  const ms = useMultiSelect()
  const selectMode = ms?.active ?? false
  const isSelected = ms?.selected.has(item.id) ?? false

  async function handleDefer(newDate: string) {
    await deferHomework(item.id, newDate)
    router.refresh()
  }
  async function handleRestore() {
    setHidden(true)
    try {
      await toggleItemDone(item.id, false)
      router.refresh()
    } catch {
      setHidden(false)
    }
  }
  async function handleDelete() {
    setHidden(true)
    toast.show({
      label: `"${item.title}" 삭제`,
      onUndo: () => { setHidden(false) },
      onCommit: async () => { await deleteHomeworkItem(item.id); router.refresh() },
    })
  }

  if (hidden) return null

  const body = (
    <div className="flex-1 min-w-0">
      <div className="font-medium break-words line-through decoration-muted-foreground/40">
        {item.title}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">
        {item.dueDate && <>~{item.dueDate} · </>}
        {item.doneAt && <>{formatRelative(item.doneAt, now)} 완료</>}
      </div>
    </div>
  )

  if (selectMode) {
    return (
      <button
        type="button"
        onClick={() => ms?.toggle(item.id)}
        className={cn(
          'w-full text-left p-3 flex items-start gap-3 transition-colors',
          isSelected ? 'bg-primary/10' : 'opacity-60 hover:bg-accent/40 hover:opacity-100',
        )}
        aria-pressed={isSelected}
      >
        <SelectMarker selected={isSelected} />
        {body}
      </button>
    )
  }

  return (
    <>
      <ItemActionsMenu
        itemKind="homework"
        currentDueDate={item.dueDate}
        onEdit={() => setEditOpen(true)}
        onDefer={handleDefer}
        onDelete={handleDelete}
      >
        <button
          type="button"
          onClick={handleRestore}
          aria-label={`"${item.title}" 완료 취소`}
          className="w-full text-left p-3 pr-12 flex items-start gap-3 opacity-60 hover:opacity-100 hover:bg-accent/40 active:bg-accent/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className="mt-0.5 w-[22px] h-[22px] rounded-full bg-good flex items-center justify-center flex-shrink-0"
            aria-hidden
          >
            <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
          </span>
          {body}
        </button>
      </ItemActionsMenu>
      {/* 점수 칩 — 행 복원 버튼 바깥(형제)에 둬서 버튼 중첩/탭 충돌 방지 */}
      <div className="px-3 pb-2 -mt-1">
        <ScoreChips id={item.id} score={item.score} reason={item.scoreReason} />
      </div>
      <EditHomeworkDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        itemId={item.id}
        initialTitle={item.title}
        initialNotes={item.notes}
        initialDueDate={item.dueDate}
      />
    </>
  )
}

/** 이번 주(현재 주 월~일)의 시작 timestamp(ms). 사용자 로컬 자정 기준. */
function startOfThisWeek(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()  // 0=Sun..6=Sat
  // 월요일을 주의 시작으로 본다 (Mon=1). Sun이면 6일 이전 월요일로.
  const offset = dow === 0 ? 6 : dow - 1
  d.setDate(d.getDate() - offset)
  return d.getTime()
}

export type DoneGroup = { key: string; label: string; items: Item[] }
export type { Item }

/**
 * 완료한 항목을 그룹화: 이번 주 → 지난 주 → 그 이전 월별 → 날짜 미상.
 * 각 그룹 내부는 doneAt 최신순.
 * Exported for unit testing.
 */
export function groupDone(items: Item[], now: number): DoneGroup[] {
  const thisWeekStart = startOfThisWeek(now)
  const lastWeekStart = thisWeekStart - 7 * 86_400_000
  const thisWeek: Item[] = []
  const lastWeek: Item[] = []
  const byMonth = new Map<string, Item[]>()
  const noDate: Item[] = []

  for (const it of items) {
    if (!it.doneAt) {
      noDate.push(it)
      continue
    }
    const t = it.doneAt.getTime()
    if (t >= thisWeekStart) {
      thisWeek.push(it)
    } else if (t >= lastWeekStart) {
      lastWeek.push(it)
    } else {
      const y = it.doneAt.getFullYear()
      const m = it.doneAt.getMonth() + 1
      const key = `${y}-${String(m).padStart(2, '0')}`
      if (!byMonth.has(key)) byMonth.set(key, [])
      byMonth.get(key)!.push(it)
    }
  }

  const sortByDoneDesc = (a: Item, b: Item) =>
    (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0)
  thisWeek.sort(sortByDoneDesc)
  lastWeek.sort(sortByDoneDesc)
  for (const arr of byMonth.values()) arr.sort(sortByDoneDesc)

  const groups: DoneGroup[] = []
  if (thisWeek.length > 0) groups.push({ key: 'this-week', label: '이번 주', items: thisWeek })
  if (lastWeek.length > 0) groups.push({ key: 'last-week', label: '지난 주', items: lastWeek })
  const monthKeys = [...byMonth.keys()].sort((a, b) => b.localeCompare(a))
  for (const k of monthKeys) {
    const [y, m] = k.split('-').map(Number)
    groups.push({ key: k, label: `${y}년 ${m}월`, items: byMonth.get(k)! })
  }
  if (noDate.length > 0) groups.push({ key: 'no-date', label: '날짜 미상', items: noDate })
  return groups
}

function DoneGroupHeader({ label, count, ids }: { label: string; count: number; ids: number[] }) {
  const ms = useMultiSelect()
  return (
    <div className="px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30 flex items-center justify-between gap-2">
      <span>{label} · {count}</span>
      {ms?.active && (
        <button
          type="button"
          onClick={() => ms.selectMany(ids)}
          className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 normal-case tracking-normal font-medium"
        >
          이 그룹 전체
        </button>
      )}
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
  if (items.length === 0) return null
  const groups = groupDone(items, now)

  return (
    <details className="group rounded-xl ring-1 ring-foreground/10 bg-card overflow-hidden" open>
      <summary className="cursor-pointer select-none flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/40 transition-colors">
        <span className="flex items-center gap-2">
          <Check className="h-4 w-4 text-good" aria-hidden />
          완료한 숙제 ({items.length})
        </span>
        <span className="text-xs text-muted-foreground group-open:hidden">펼치기</span>
        <span className="text-xs text-muted-foreground hidden group-open:inline">접기</span>
      </summary>
      <div className="border-t">
        {groups.map((g, idx) => (
          <div key={g.key} className={cn(idx > 0 && 'border-t')}>
            <DoneGroupHeader label={g.label} count={g.items.length} ids={g.items.map((i) => i.id)} />
            <div className="divide-y">
              {g.items.map((it) => (
                <DoneRow key={it.id} item={it} now={now} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}
