import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAcademyDetail } from '@/server/actions/academy-detail'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { localDateIso } from '@/server/util/date'
import { ActiveAcademyItems, DoneAcademyItems } from './_components/academy-items'

const SUBJECT_KO: Record<string, string> = {
  math: '수학', english: '영어', korean: '국어', art: '미술',
  music: '음악', pe: '체육', science: '과학', other: '기타',
}
const DAY_KO: Record<string, string> = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' }

export default async function AcademyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { id } = await params
  const { date: dateFilter } = await searchParams
  const numId = Number(id)
  const data = await getAcademyDetail(numId)
  if (!data) notFound()

  const { academy, active: allActive, done: allDone } = data
  const todayIso = localDateIso()

  // Optional date filter (from timetable slot drill-down)
  const active = dateFilter ? allActive.filter((it) => it.dueDate === dateFilter) : allActive
  const done = dateFilter ? allDone.filter((it) => it.dueDate === dateFilter) : allDone

  const scheduleSlots = academy.scheduleRule?.slots ?? []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href={dateFilter ? '/timetable' : '/academies'}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        >
          ← {dateFilter ? '시간표' : '학원 목록'}
        </Link>
        <Link href={`/academies/${numId}/edit`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
          편집
        </Link>
      </div>

      {/* Date-filter banner */}
      {dateFilter && (
        <div className="rounded-md bg-accent/40 border border-foreground/10 px-3 py-2 text-sm flex items-center justify-between">
          <span>
            <span className="font-medium">{dateFilter}</span> 마감 항목만 보는 중
          </span>
          <Link
            href={`/academies/${numId}`}
            className="text-xs underline underline-offset-2 hover:text-foreground"
          >
            전체 보기
          </Link>
        </div>
      )}

      {/* Academy info card */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full flex-shrink-0"
            style={{ background: academy.color }}
            aria-hidden
          />
          <h1 className="text-xl font-semibold">{academy.name}</h1>
          <span className="text-sm text-muted-foreground">({SUBJECT_KO[academy.subject] ?? academy.subject})</span>
        </div>

        {scheduleSlots.length > 0 && (
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">이번 주: </span>
            {scheduleSlots.map((s, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                {DAY_KO[s.day] ?? s.day} {s.start}–{s.end}
              </span>
            ))}
          </div>
        )}

        {academy.location && (
          <div className="text-sm">
            <span className="text-muted-foreground">위치: </span>
            {academy.location}
          </div>
        )}

        {academy.notes && (
          <div className="text-sm">
            <span className="text-muted-foreground">메모: </span>
            {academy.notes}
          </div>
        )}

        {academy.extractionHint && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
            힌트: &ldquo;{academy.extractionHint}&rdquo;
          </div>
        )}
      </Card>

      {/* CTA: add homework for this academy */}
      <Link
        href={`/homework/upload?academy=${numId}`}
        className={cn(buttonVariants(), 'w-full justify-center')}
      >
        + 이 학원 숙제 추가
      </Link>

      {/* Active homework — interactive toggle */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold px-1">📚 진행 중인 숙제 ({active.length})</h2>
        <ActiveAcademyItems items={active} todayIso={todayIso} />
      </section>

      {/* Completed homework — collapsible, with undo */}
      <DoneAcademyItems items={done} />
    </div>
  )
}
