'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export function KidsDoneCard({
  id, title, academyName, academyColor, onUndo,
}: {
  id: number
  title: string
  academyName: string
  academyColor: string
  onUndo: (formData: FormData) => Promise<void>
}) {
  return (
    <form action={onUndo} className="block">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className={cn(
          'w-full text-left p-4 rounded-xl border bg-card hover:bg-accent/40 active:bg-accent/60',
          'transition-colors flex items-center gap-3 min-h-[64px] opacity-70 hover:opacity-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0" aria-hidden>
          <Check className="h-4 w-4 text-white" />
        </span>
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ background: academyColor }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">{academyName}</div>
          <div className="font-medium break-words line-through decoration-muted-foreground/50">{title}</div>
        </div>
        <span className="text-[10px] text-muted-foreground flex-shrink-0 leading-tight">
          누르면<br />되돌리기
        </span>
      </button>
    </form>
  )
}
