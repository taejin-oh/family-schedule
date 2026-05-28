'use client'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: '월' }, { key: 'tue', label: '화' },
  { key: 'wed', label: '수' }, { key: 'thu', label: '목' },
  { key: 'fri', label: '금' }, { key: 'sat', label: '토' }, { key: 'sun', label: '일' },
]

const PRESETS: { label: string; days: DayKey[] }[] = [
  { label: '매일', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
  { label: '평일', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  { label: '주말', days: ['sat', 'sun'] },
  { label: '해제', days: [] },
]

/**
 * 매일 반복 task의 요일 선택. 위쪽에 매일/평일/주말/해제 4 프리셋(자주 쓰는 조합 한 탭),
 * 아래는 7개 요일 토글. recurring-form / edit-recurring-dialog에서 공유.
 */
export function WeekdayPicker({
  value,
  onChange,
}: {
  value: DayKey[]
  onChange: (next: DayKey[]) => void
}) {
  function toggleDay(d: DayKey) {
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d])
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.days)}
            className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap">
        {DAYS.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => toggleDay(d.key)}
            className={cn(
              buttonVariants({ variant: value.includes(d.key) ? 'default' : 'outline', size: 'sm' }),
              'w-12',
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  )
}
