'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RecurringTaskInput } from '@/server/actions/recurring'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { WeekdayPicker, type DayKey } from '@/components/weekday-picker'
import { cn } from '@/lib/utils'

type Cadence = 'daily' | 'weekly'

const COLORS: { hex: string; name: string }[] = [
  { hex: '#ef4444', name: '빨강' },
  { hex: '#f59e0b', name: '주황' },
  { hex: '#10b981', name: '초록' },
  { hex: '#3b82f6', name: '파랑' },
  { hex: '#8b5cf6', name: '보라' },
  { hex: '#ec4899', name: '분홍' },
  { hex: '#475569', name: '회색' },
]

export function RecurringForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial?: Partial<RecurringTaskInput>
  onSubmit: (input: RecurringTaskInput) => Promise<{ ok: boolean; error?: string }>
  submitLabel: string
}) {
  const router = useRouter()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [color, setColor] = useState(initial?.color ?? COLORS[3].hex)
  const [cadence, setCadence] = useState<Cadence>(initial?.cadence ?? 'daily')
  const [days, setDays] = useState<DayKey[]>(initial?.daysOfWeek ?? [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
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
    const res = await onSubmit(input)
    if (!res.ok) {
      setError(res.error ?? '저장 실패')
      setBusy(false)
    } else {
      router.push('/recurring')
    }
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="title">제목</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 구몬, 책읽기, 학교 숙제"
            required
          />
        </div>

        <div className="space-y-2">
          <Label>반복 주기</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCadence('daily')}
              className={cn(
                buttonVariants({ variant: cadence === 'daily' ? 'default' : 'outline' }),
                'h-10 w-full',
              )}
              aria-pressed={cadence === 'daily'}
            >
              매일
            </button>
            <button
              type="button"
              onClick={() => setCadence('weekly')}
              className={cn(
                buttonVariants({ variant: cadence === 'weekly' ? 'default' : 'outline' }),
                'h-10 w-full',
              )}
              aria-pressed={cadence === 'weekly'}
            >
              매주
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {cadence === 'weekly'
              ? '이번 주 안에 한 번 끝내면 됩니다. 매주 월요일에 새로 시작됩니다.'
              : '선택한 요일마다 매일 표시됩니다.'}
          </p>
        </div>

        <div className="space-y-2">
          <Label>색상</Label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c.hex}
                onClick={() => setColor(c.hex)}
                className={cn(
                  'w-9 h-9 rounded-full transition-transform',
                  color === c.hex
                    ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background scale-110'
                    : 'hover:scale-105'
                )}
                style={{ background: c.hex }}
                aria-label={c.name}
              />
            ))}
          </div>
        </div>

        {cadence === 'daily' && (
          <div className="space-y-2">
            <Label>요일</Label>
            <WeekdayPicker value={days} onChange={setDays} />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="notes">메모 (선택)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={busy} className="flex-1">
            {busy ? '저장 중…' : submitLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/recurring')}
          >
            취소
          </Button>
        </div>
      </form>
    </Card>
  )
}
