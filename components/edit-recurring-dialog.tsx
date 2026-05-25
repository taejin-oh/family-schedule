'use client'

import { useState } from 'react'
import type { RecurringTaskInput } from '@/server/actions/recurring'
import { updateRecurringTask } from '@/server/actions/recurring'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'

type DayKey = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'
type Cadence = 'daily' | 'weekly'

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: '월' }, { key: 'tue', label: '화' },
  { key: 'wed', label: '수' }, { key: 'thu', label: '목' },
  { key: 'fri', label: '금' }, { key: 'sat', label: '토' }, { key: 'sun', label: '일' },
]
const COLORS = ['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#475569']

type Props = {
  open: boolean
  onClose: () => void
  taskId: number
  initial: {
    title: string
    notes: string | null
    color: string
    cadence: 'daily' | 'weekly'
    daysOfWeek: DayKey[]
  }
}

function RecurringEditForm({
  taskId,
  initial,
  onClose,
}: Omit<Props, 'open'>) {
  const [title, setTitle] = useState(initial.title)
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [color, setColor] = useState(initial.color)
  const [cadence, setCadence] = useState<Cadence>(initial.cadence)
  const [days, setDays] = useState<DayKey[]>(initial.daysOfWeek)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function toggleDay(d: DayKey) {
    setDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d])
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const input: RecurringTaskInput = {
      title: title.trim(),
      notes: notes.trim() || null,
      color,
      cadence,
      daysOfWeek: cadence === 'weekly' ? [] : days,
    }
    const res = await updateRecurringTask(taskId, input)
    if (!res.ok) {
      setError(res.error ?? '저장 실패')
      setBusy(false)
    } else {
      onClose()
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="rt-title">제목</Label>
        <Input
          id="rt-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label>반복 주기</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setCadence('daily')}
            className={cn(buttonVariants({ variant: cadence === 'daily' ? 'default' : 'outline' }), 'h-10 w-full')}
            aria-pressed={cadence === 'daily'}
          >
            매일
          </button>
          <button
            type="button"
            onClick={() => setCadence('weekly')}
            className={cn(buttonVariants({ variant: cadence === 'weekly' ? 'default' : 'outline' }), 'h-10 w-full')}
            aria-pressed={cadence === 'weekly'}
          >
            매주
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>색상</Label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                'w-9 h-9 rounded-full transition-transform',
                color === c
                  ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background scale-110'
                  : 'hover:scale-105',
              )}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
        </div>
      </div>

      {cadence === 'daily' && (
        <div className="space-y-2">
          <Label>요일</Label>
          <div className="flex gap-2 flex-wrap">
            {DAYS.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => toggleDay(d.key)}
                className={cn(
                  buttonVariants({ variant: days.includes(d.key) ? 'default' : 'outline', size: 'sm' }),
                  'w-12',
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="rt-notes">메모 (선택)</Label>
        <Textarea
          id="rt-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={busy} className="flex-1">
          {busy ? '저장 중…' : '저장'}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>취소</Button>
      </div>
    </form>
  )
}

export function EditRecurringDialog({ open, onClose, ...formProps }: Props) {
  const isDesktop = useMediaQuery('(hover: hover)')

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>반복 할일 수정</DialogTitle>
          </DialogHeader>
          <RecurringEditForm onClose={onClose} {...formProps} />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>반복 할일 수정</SheetTitle>
        </SheetHeader>
        <RecurringEditForm onClose={onClose} {...formProps} />
      </SheetContent>
    </Sheet>
  )
}
