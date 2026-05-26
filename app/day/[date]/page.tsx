import Link from 'next/link'
import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { ArrowLeft } from 'lucide-react'
import { listCommittedItems, toggleItemDone } from '@/server/actions/homework'
import { Card } from '@/components/ui/card'
import { localDateIso } from '@/server/util/date'
import { KidsTodoCard } from '@/app/_components/kids-todo-card'

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토']

function diffDays(due: string, todayIso: string): number {
  const t = new Date(todayIso + 'T00:00:00')
  const d = new Date(due + 'T00:00:00')
  return Math.round((d.getTime() - t.getTime()) / 86_400_000)
}

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound()
  const todayIso = localDateIso()

  const all = await listCommittedItems()
  // listCommittedItems excludes done items (SQL WHERE doneAt IS NULL),
  // so this page only shows "남은 (active) only" — matching the "이번 주
  // 남은 숙제" entry. Completed-on-this-day is intentionally out of scope.
  const active = all.filter((it) => it.dueDate === date)

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

  async function onComplete(formData: FormData) {
    'use server'
    const id = Number(formData.get('id'))
    await toggleItemDone(id, true)
    revalidatePath('/')
    revalidatePath('/dashboard')
    revalidatePath(`/day/${date}`)
  }
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
                todayIso={todayIso}
                onComplete={onComplete}
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
