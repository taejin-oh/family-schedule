'use client'

import Link from 'next/link'
import { useState, type MouseEvent } from 'react'
import { cn } from '@/lib/utils'

type ChipDef = {
  key: string
  label: string
  count: number
  href: string
  dot?: string
}

/**
 * Optimistic active 적용된 chip group. 클릭 즉시 active visual을 갱신해서
 * server fetch + RSC commit 동안 사용자 perception 빈틈 없음. URL은 그대로
 * 진행되므로 server-side filter도 함께 갱신됨.
 *
 * - prefetch: 각 chip RSC payload + chunks 미리 받아둠.
 * - URL이 실제로 갱신되면 optimistic state는 자동 reset.
 */
/**
 * NOTE: 부모에서 `<FilterChipGroup key={current} ... />` 패턴으로 사용해서 current가
 * 외부에서 바뀌면 component가 remount되도록. 그러면 optimistic state는 null로 초기화.
 */
export function FilterChipGroup({ current, chips }: { current: string; chips: ChipDef[] }) {
  const [optimistic, setOptimistic] = useState<string | null>(null)
  const display = optimistic ?? current

  function pick(key: string) {
    return (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
      setOptimistic(key)
    }
  }

  return (
    <>
      {chips.map((c) => {
        const active = display === c.key
        return (
          <Link
            key={c.key}
            href={c.href}
            prefetch
            onClick={pick(c.key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors',
              active
                ? 'bg-foreground text-background'
                : 'bg-card text-foreground/80 hover:bg-accent hover:text-foreground'
            )}
          >
            {c.dot && (
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: c.dot }}
                aria-hidden
              />
            )}
            <span>{c.label}</span>
            <span className={cn('text-xs font-normal tabular-nums', active ? 'text-background/80' : 'text-muted-foreground')}>
              {c.count}
            </span>
          </Link>
        )
      })}
    </>
  )
}
