import { cn } from '@/lib/utils'

type Day = { label: string; date: string; status: 'done' | 'today' | 'future' | 'missed' }

/**
 * 아이 홈 가로 모드 좌측 히어로의 "이번 주 출석" 보드. stamps(auto)에서 파생.
 * 완료일=⭐, 오늘=점, 앞으로/미완=빈칸. 헤더 우측에 🔥연속.
 */
export function AttendanceBoard({ days, streak }: { days: Day[]; streak: number }) {
  const doneCount = days.filter((d) => d.status === 'done').length
  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          이번 주 출석
        </div>
        <div className="text-xs font-semibold text-muted-foreground">
          {streak > 0 ? `🔥 ${streak}일 연속` : `${doneCount}일 완료`}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => (
          <div key={d.date} className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                'w-full aspect-square rounded-lg flex items-center justify-center text-lg',
                d.status === 'done' && 'bg-reward-soft',
                d.status === 'today' && 'bg-brand-soft ring-2 ring-brand',
                (d.status === 'future' || d.status === 'missed') && 'bg-muted/50',
              )}
            >
              {d.status === 'done' ? (
                '⭐'
              ) : d.status === 'today' ? (
                <span className="w-1.5 h-1.5 rounded-full bg-brand" aria-hidden />
              ) : (
                ''
              )}
            </div>
            <span
              className={cn(
                'text-[11px] font-semibold',
                d.status === 'today' ? 'text-brand' : 'text-muted-foreground',
              )}
            >
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
