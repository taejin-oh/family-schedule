'use client'

import { useState } from 'react'
import type { AcademyInput } from '@/server/actions/academies'

type Day = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'
const DAYS: { key: Day; label: string }[] = [
  { key: 'mon', label: '월' }, { key: 'tue', label: '화' },
  { key: 'wed', label: '수' }, { key: 'thu', label: '목' },
  { key: 'fri', label: '금' }, { key: 'sat', label: '토' }, { key: 'sun', label: '일' },
]
const SUBJECTS = ['math','english','korean','art','music','pe','science','other'] as const
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
    <form onSubmit={submit} className="space-y-4 bg-white p-4 rounded border">
      <label className="block">
        <div className="text-sm mb-1">학원 이름</div>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded px-3 py-2" required />
      </label>

      <label className="block">
        <div className="text-sm mb-1">과목</div>
        <select value={subject} onChange={(e) => setSubject(e.target.value as any)} className="w-full border rounded px-3 py-2">
          {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>

      <div>
        <div className="text-sm mb-1">색상</div>
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button type="button" key={c} onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full ${color === c ? 'ring-2 ring-black' : ''}`}
              style={{ background: c }} aria-label={c} />
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm mb-1">요일</div>
        <div className="flex gap-2">
          {DAYS.map((d) => (
            <button type="button" key={d.key} onClick={() => toggleDay(d.key)}
              className={`px-3 py-1 rounded border ${days.includes(d.key) ? 'bg-blue-600 text-white' : 'bg-white'}`}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <label className="block flex-1">
          <div className="text-sm mb-1">시작</div>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-full border rounded px-3 py-2" />
        </label>
        <label className="block flex-1">
          <div className="text-sm mb-1">종료</div>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full border rounded px-3 py-2" />
        </label>
      </div>

      <label className="block">
        <div className="text-sm mb-1">위치 (선택)</div>
        <input value={location} onChange={(e) => setLocation(e.target.value)} className="w-full border rounded px-3 py-2" />
      </label>

      <label className="block">
        <div className="text-sm mb-1">메모 (선택)</div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border rounded px-3 py-2" rows={2} />
      </label>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <button disabled={busy} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
        {busy ? '저장 중…' : submitLabel}
      </button>
    </form>
  )
}
