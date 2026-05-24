'use client'

import { useState } from 'react'
import type { AcademyInput } from '@/server/actions/academies'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Day = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'
const DAYS: { key: Day; label: string }[] = [
  { key: 'mon', label: '월' }, { key: 'tue', label: '화' },
  { key: 'wed', label: '수' }, { key: 'thu', label: '목' },
  { key: 'fri', label: '금' }, { key: 'sat', label: '토' }, { key: 'sun', label: '일' },
]
const SUBJECTS: { value: AcademyInput['subject']; label: string }[] = [
  { value: 'math', label: '수학' },
  { value: 'english', label: '영어' },
  { value: 'korean', label: '국어' },
  { value: 'art', label: '미술' },
  { value: 'music', label: '음악' },
  { value: 'pe', label: '체육' },
  { value: 'science', label: '과학' },
  { value: 'other', label: '기타' },
]
const COLORS = ['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#475569']

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
  const [days, setDays] = useState<Day[]>(initial?.scheduleRule?.days ?? [])
  const [start, setStart] = useState(initial?.scheduleRule?.start ?? '19:00')
  const [end, setEnd] = useState(initial?.scheduleRule?.end ?? '21:00')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const toggleDay = (d: Day) =>
    setDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const input: AcademyInput = {
      name: name.trim(),
      subject,
      color,
      scheduleRule: days.length > 0 ? { days, start, end } : null,
      location: location.trim() || null,
      notes: notes.trim() || null,
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
            <SelectTrigger id="subject" className="w-full"><SelectValue /></SelectTrigger>
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
          <Label>요일</Label>
          <div className="flex gap-1.5">
            {DAYS.map((d) => (
              <Button
                type="button"
                key={d.key}
                variant={days.includes(d.key) ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleDay(d.key)}
              >
                {d.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="start">시작</Label>
            <Input id="start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end">종료</Label>
            <Input id="end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">위치 (선택)</Label>
          <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">메모 (선택)</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? '저장 중…' : submitLabel}
        </Button>
      </form>
    </Card>
  )
}
