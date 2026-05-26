'use client'

import { useState } from 'react'
import type { AcademyInput } from '@/server/actions/academies'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { SUBJECTS, subjectLabel } from '@/lib/subjects'
import { isValidScheduleTime, normalizeSlotAfterEdit, normalizeSlotsForSubmit } from '@/lib/time-slots'
import { cn } from '@/lib/utils'

type Day = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'
type Slot = { day: Day; start: string; end: string }

const DAYS: { key: Day; label: string }[] = [
  { key: 'mon', label: '월' }, { key: 'tue', label: '화' },
  { key: 'wed', label: '수' }, { key: 'thu', label: '목' },
  { key: 'fri', label: '금' }, { key: 'sat', label: '토' }, { key: 'sun', label: '일' },
]
const DAY_ORDER: Record<Day, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 }

const COLORS = ['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#475569']
const TIME_INPUT_CLASS = cn(
  'h-8 min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none',
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50',
  'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm',
  'dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
  'w-full pr-9 font-mono tabular-nums text-transparent caret-transparent',
)
const TIME_VALUE_CLASS = 'pointer-events-none absolute inset-y-0 left-2.5 flex items-center font-mono text-sm tabular-nums text-foreground'

export function AcademyForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial?: Partial<AcademyInput>
  onSubmit: (input: AcademyInput) => Promise<{ ok: boolean; error?: string }>
  submitLabel: string
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [subject, setSubject] = useState<AcademyInput['subject']>(initial?.subject ?? 'math')
  const [color, setColor] = useState(initial?.color ?? COLORS[3])
  const [slots, setSlots] = useState<Slot[]>(initial?.scheduleRule?.slots ?? [])
  const [location, setLocation] = useState(initial?.location ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [extractionHint, setExtractionHint] = useState(initial?.extractionHint ?? '')
  const [error, setError] = useState<string | null>(null)
  const [timeWarning, setTimeWarning] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function toggleDay(d: Day) {
    setSlots((cur) => {
      if (cur.some((s) => s.day === d)) {
        return cur.filter((s) => s.day !== d)
      }
      // Use the most recently added slot's times as default for the new day.
      const last = cur[cur.length - 1]
      const defaultStart = last?.start ?? '19:00'
      const defaultEnd = last?.end ?? '21:00'
      const next = [...cur, { day: d, start: defaultStart, end: defaultEnd }]
      next.sort((a, b) => DAY_ORDER[a.day] - DAY_ORDER[b.day])
      return next
    })
  }

  function updateSlotDraft(d: Day, field: 'start' | 'end', value: string) {
    const current = slots.find((s) => s.day === d)
    if (!current) return

    const draft = { ...current, [field]: value }
    if (value.length === 5 && isValidScheduleTime(value)) {
      const res = normalizeSlotAfterEdit(draft, field)
      setSlots((cur) => cur.map((s) => (s.day === d ? res.slot : s)))
      setTimeWarning(res.warning)
      return
    }

    setSlots((cur) => cur.map((s) => (s.day === d ? draft : s)))
  }

  function normalizeSlot(d: Day, field: 'start' | 'end', value: string) {
    const current = slots.find((s) => s.day === d)
    if (!current) return

    const res = normalizeSlotAfterEdit({ ...current, [field]: value }, field)
    setSlots((cur) => cur.map((s) => (s.day === d ? res.slot : s)))
    setTimeWarning(res.warning)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const normalized = normalizeSlotsForSubmit(slots)
    if (normalized.warning) {
      setSlots(normalized.slots)
      setTimeWarning(normalized.warning)
      setBusy(false)
      return
    }

    setTimeWarning(null)
    const input: AcademyInput = {
      name: name.trim(),
      subject,
      color,
      scheduleRule: normalized.slots.length > 0 ? { slots: normalized.slots } : null,
      location: location.trim() || null,
      notes: notes.trim() || null,
      extractionHint: extractionHint.trim() || null,
    }
    const res = await onSubmit(input)
    if (!res.ok) { setError(res.error ?? '저장 실패'); setBusy(false) }
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">학원 이름</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="subject">과목</Label>
          <Select value={subject} onValueChange={(v) => setSubject(v as AcademyInput['subject'])}>
            <SelectTrigger id="subject" className="w-full">
              <SelectValue>{subjectLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SUBJECTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>색상</Label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  'w-9 h-9 rounded-full transition-transform',
                  color === c ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background scale-110' : 'hover:scale-105'
                )}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>요일 · 시간</Label>
          <div className="space-y-2">
            {DAYS.map((d) => {
              const slot = slots.find((s) => s.day === d.key)
              const active = !!slot
              return (
                <div key={d.key} className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleDay(d.key)}
                    className="w-12 shrink-0"
                  >
                    {d.label}
                  </Button>
                  {active && slot && (
                    <div className="flex items-center gap-2 flex-1">
                      <div className="relative flex-1">
                        <span className={TIME_VALUE_CLASS} aria-hidden="true">{slot.start}</span>
                        <input
                          type="time"
                          lang="en-GB"
                          min="00:00"
                          max="23:59"
                          value={slot.start}
                          onInput={(e) => updateSlotDraft(d.key, 'start', e.currentTarget.value)}
                          onChange={(e) => updateSlotDraft(d.key, 'start', e.currentTarget.value)}
                          onBlurCapture={(e) => normalizeSlot(d.key, 'start', e.currentTarget.value)}
                          className={TIME_INPUT_CLASS}
                          aria-label={`${d.label}요일 시작`}
                        />
                      </div>
                      <span className="text-muted-foreground">–</span>
                      <div className="relative flex-1">
                        <span className={TIME_VALUE_CLASS} aria-hidden="true">{slot.end}</span>
                        <input
                          type="time"
                          lang="en-GB"
                          min="00:00"
                          max="23:59"
                          value={slot.end}
                          onInput={(e) => updateSlotDraft(d.key, 'end', e.currentTarget.value)}
                          onChange={(e) => updateSlotDraft(d.key, 'end', e.currentTarget.value)}
                          onBlurCapture={(e) => normalizeSlot(d.key, 'end', e.currentTarget.value)}
                          className={TIME_INPUT_CLASS}
                          aria-label={`${d.label}요일 종료`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {timeWarning && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800" aria-live="polite">
              {timeWarning}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">위치 (선택)</Label>
          <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">메모 (선택)</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="extractionHint">
            AI 추출 힌트 (선택)
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              이 학원의 종이/PDF 구조를 설명해두면 AI가 더 정확히 추출함
            </span>
          </Label>
          <Textarea
            id="extractionHint"
            value={extractionHint}
            onChange={(e) => setExtractionHint(e.target.value)}
            placeholder="예: 'Lesson topics' 열은 수업 토픽이라 무시. 오른쪽 'Homework' 열만 숙제. 맨 위 파란 바탕은 책 이름. 날짜 열이 마감일."
            rows={4}
            className="resize-y text-sm"
          />
          <p className="text-xs text-muted-foreground">한 번 입력하면 이 학원 업로드 때마다 자동으로 적용됨 (매번 수정 가능).</p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? '저장 중…' : submitLabel}
        </Button>
      </form>
    </Card>
  )
}
