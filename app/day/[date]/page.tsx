import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { listTodoByDueBetween } from '@/server/actions/homework'
import { Card } from '@/components/ui/card'
import { localDateIso } from '@/server/util/date'
import { KidsTodoCard } from '@/app/_components/kids-todo-card'
import { diffDays, WEEKDAYS_KO as DAY_KO } from '@/lib/date'

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound()
  const todayIso = localDateIso()

  // dueDate가 정확히 그 날짜인 active(committed + 미완료)만 SQL-side로. 전체 active
  // fetch 후 JS filter하던 패턴 제거 — 학년 누적될수록 transfer/메모리 이득.
  const active = await listTodoByDueBetween(date, date)

  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const wd = DAY_KO[dt.getDay()]
  const monthDay = `${m}월 ${d}일`
  const dd = diffDays(date, todayIso)
  const relLabel =
    dd === 0 ? '오늘' :
    dd === 1 ? '내일' :
    dd < 0 ? `${Math.abs(dd)}일 지남` :
    `${dd}일 후`

  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> 홈으로
      </Link>

      <Card className="p-5 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{wd}요일 숙제</h1>
        <div className="text-sm text-muted-foreground">{monthDay} · {relLabel}</div>
      </Card>

      {active.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold px-1">해야 할 숙제</h2>
          <div className="space-y-2">
            {active.map((it) => (
              <KidsTodoCard
                key={it.id}
                id={it.id}
                title={it.title}
                academyName={it.academyName}
                academyColor={it.academyColor}
                dueDate={it.dueDate}
                pinnedDate={it.pinnedDate}
                todayIso={todayIso}
              />
            ))}
          </div>
        </section>
      ) : (
        <Card className="p-10 text-center space-y-2">
          <div className="text-4xl">🌤️</div>
          <div className="text-lg font-semibold">남은 숙제 없음</div>
        </Card>
      )}
    </div>
  )
}
