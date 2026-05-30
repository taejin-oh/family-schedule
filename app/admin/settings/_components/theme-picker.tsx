'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { setTheme } from '@/server/actions/settings'
import { cn } from '@/lib/utils'

type Theme = 'clarity' | 'warm'

// 각 톤의 대표색 미리보기 (현재 적용 테마와 무관하게 보이도록 하드코딩).
const OPTS: { key: Theme; label: string; desc: string; bg: string; accent: string; ink: string }[] = [
  { key: 'clarity', label: '맑음', desc: '또렷하고 시원한 톤', bg: '#F4F5F7', accent: '#2B5CE6', ink: '#16181D' },
  { key: 'warm', label: '포근', desc: '따뜻하고 부드러운 톤', bg: '#EFE8DC', accent: '#C0623A', ink: '#3A332B' },
]

export function ThemePicker({ current }: { current: Theme }) {
  const [pending, startTransition] = useTransition()
  // optimistic 선택 — 클릭 즉시 테두리 이동, 실제 테마는 layout revalidate로 반영.
  const [optimistic, setOptimistic] = useState<Theme | null>(null)
  const selected = optimistic ?? current

  function pick(key: Theme) {
    if (key === selected) return
    setOptimistic(key)
    startTransition(async () => {
      const res = await setTheme(key)
      if (!res.ok) setOptimistic(null)
    })
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {OPTS.map((o) => {
        const on = selected === o.key
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => pick(o.key)}
            disabled={pending}
            aria-pressed={on}
            className={cn(
              'relative rounded-xl border p-3 text-left transition-colors disabled:cursor-wait',
              on ? 'border-brand ring-2 ring-brand/30 bg-brand-soft' : 'border-border hover:bg-accent',
            )}
          >
            {on && (
              <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-brand text-brand-foreground flex items-center justify-center">
                <Check className="w-3 h-3" strokeWidth={3} aria-hidden />
              </span>
            )}
            {/* 미리보기 스와치 */}
            <div
              className="flex items-center gap-1.5 rounded-lg p-2 mb-2"
              style={{ background: o.bg }}
              aria-hidden
            >
              <span className="w-4 h-4 rounded-full" style={{ background: o.accent }} />
              <span className="w-4 h-4 rounded-full" style={{ background: '#fff' }} />
              <span className="flex-1 h-1.5 rounded-full" style={{ background: o.accent, opacity: 0.5 }} />
              <span className="w-5 h-2 rounded-sm" style={{ background: o.ink, opacity: 0.85 }} />
            </div>
            <div className="font-semibold">{o.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{o.desc}</div>
          </button>
        )
      })}
    </div>
  )
}
