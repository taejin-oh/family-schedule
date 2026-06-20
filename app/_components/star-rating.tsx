'use client'

import { cn } from '@/lib/utils'

/**
 * 별점 0~5 선택 위젯. value=null이면 미기록(빈 별).
 * - "0" 버튼: 0점. 5개 별: 1~5점.
 * - 현재 선택된 요소를 다시 누르면 미기록(null)으로 해제.
 */
export function StarRating({
  value, onChange, disabled, size = 'sm',
}: {
  value: number | null
  onChange: (v: number | null) => void
  disabled?: boolean
  size?: 'sm' | 'lg'
}) {
  const starCls = size === 'lg' ? 'text-[28px] px-0.5' : 'text-xl'
  return (
    <div className="inline-flex items-center gap-0.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(value === 0 ? null : 0)}
        aria-label="별 0개"
        aria-pressed={value === 0}
        className={cn(
          'px-1.5 py-0.5 rounded text-xs font-semibold transition-colors disabled:opacity-50',
          value === 0 ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        0
      </button>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = value !== null && i <= value
        return (
          <button
            key={i}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === i ? null : i)}
            aria-label={`별 ${i}개`}
            aria-pressed={value === i}
            className={cn(
              starCls, 'leading-none transition-colors disabled:opacity-50',
              filled ? 'text-amber-400' : 'text-muted-foreground/30 hover:text-amber-300',
            )}
          >
            {filled ? '★' : '☆'}
          </button>
        )
      })}
    </div>
  )
}
