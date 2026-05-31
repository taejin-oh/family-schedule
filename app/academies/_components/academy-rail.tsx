import Link from 'next/link'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const SUBJECT_KO: Record<string, string> = {
  math: '수학', english: '영어', korean: '국어', art: '미술',
  music: '음악', pe: '체육', science: '과학', other: '기타',
}

type RailAcademy = { id: number; name: string; subject: string; color: string }

/**
 * 가로 모드(lg+) 학원 상세 좌측 마스터 레일. 항목 클릭 = /academies/[id] 이동(prefetch).
 * 서버 컴포넌트 — activeId로 현재 학원 강조. 모바일에서는 hidden.
 */
export function AcademyRail({
  academies,
  progress,
  activeId,
}: {
  academies: RailAcademy[]
  progress: Record<number, { total: number; done: number }>
  activeId: number
}) {
  return (
    <aside className="hidden lg:block lg:w-[280px] lg:shrink-0 lg:sticky lg:top-7 lg:self-start">
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pb-2">
        학원
      </div>
      <nav className="flex flex-col gap-1">
        {academies.map((a) => {
          const on = a.id === activeId
          const p = progress[a.id]
          const done = !!p && p.total > 0 && p.done === p.total
          return (
            <Link
              key={a.id}
              href={`/academies/${a.id}`}
              prefetch
              aria-current={on ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors',
                on ? 'bg-brand-soft' : 'hover:bg-accent',
              )}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: a.color }}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <div className={cn('text-sm truncate', on ? 'font-bold text-foreground' : 'font-semibold')}>
                  {a.name}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {SUBJECT_KO[a.subject] ?? a.subject}
                </div>
              </div>
              {p && p.total > 0 && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-xs tabular-nums font-semibold flex-shrink-0',
                    done ? 'text-good' : 'text-muted-foreground',
                  )}
                >
                  {done && <Check className="h-3.5 w-3.5" aria-hidden />}
                  {p.done}/{p.total}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
