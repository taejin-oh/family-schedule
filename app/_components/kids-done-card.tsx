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
          'w-full text-left p-3 rounded-xl bg-card ring-1 ring-foreground/10',
          'hover:bg-accent/40 active:bg-accent/60 transition-colors',
          'flex items-center gap-3 min-h-[64px] opacity-70 hover:opacity-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span
          className="w-[22px] h-[22px] rounded-full bg-green-600 flex items-center justify-center flex-shrink-0"
          aria-hidden
        >
          <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
        </span>
        <span
          className="w-[5px] h-9 rounded-full flex-shrink-0"
          style={{ background: academyColor }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-[15px] break-words line-through decoration-muted-foreground/50">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{academyName}</div>
        </div>
      </button>
    </form>
  )
}
