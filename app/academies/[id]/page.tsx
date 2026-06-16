import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAcademyDetail } from '@/server/actions/academy-detail'
import { listAcademies, getWeeklyProgressMap } from '@/server/actions/academies'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { localDateIso } from '@/server/util/date'
import { ActiveAcademyItems, DoneAcademyItems } from './_components/academy-items'
import { BatchesRollback } from './_components/batches-rollback'
import { AcademyRail } from '../_components/academy-rail'
import { MultiSelectProvider, MultiSelectToggle } from '@/app/_components/multi-select-bar'
import { subjectLabel } from '@/lib/subjects'

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
  const [data, allAcademies, progressMap] = await Promise.all([
    getAcademyDetail(numId),
    listAcademies(),
    getWeeklyProgressMap(),
  ])
  if (!data) notFound()

  const { academy, active: allActive, done: allDone, batches } = data
  const todayIso = localDateIso()

  // Optional date filter (from timetable slot drill-down)
  const active = dateFilter ? allActive.filter((it) => it.dueDate === dateFilter) : allActive
  const done = dateFilter ? allDone.filter((it) => it.dueDate === dateFilter) : allDone

  const scheduleSlots = academy.scheduleRule?.slots ?? []

  // 다중선택 일괄 처리용 ID 묶음. 학원 상세는 정책상 delete-only.
  const activeIds = active.map((it) => it.id)
  const doneIds = done.map((it) => it.id)

  return (
    <MultiSelectProvider activeIds={activeIds} doneIds={doneIds} mode="delete-only">
    {/* lg: 좌측 학원 마스터 레일 + 우측 상세 (모바일은 상세만) */}
    <div className="lg:flex lg:gap-6 lg:items-start">
      <AcademyRail academies={allAcademies} progress={progressMap} activeId={numId} />
      <div className="flex-1 min-w-0 space-y-4">
      <header className="px-1 pt-2 pb-1 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={dateFilter ? '/timetable' : '/academies'}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← {dateFilter ? '시간표' : '학원 목록'}
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="inline-block w-[5px] h-7 rounded-full flex-shrink-0"
              style={{ background: academy.color }}
              aria-hidden
            />
            <h1 className="text-[28px] leading-tight font-bold tracking-tight truncate">{academy.name}</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {subjectLabel(academy.subject)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <MultiSelectToggle />
          <Link href={`/academies/${numId}/edit`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            편집
          </Link>
        </div>
      </header>

      {dateFilter && (
        <Card className="px-3 py-2 gap-0 flex flex-row items-center justify-between text-sm">
          <span>
            <span className="font-medium">{dateFilter}</span> 마감 항목만 보는 중
          </span>
          <Link
            href={`/academies/${numId}`}
            className="text-xs underline underline-offset-2 hover:text-foreground"
          >
            전체 보기
          </Link>
        </Card>
      )}

      <Card className="p-4 gap-2">
        {scheduleSlots.length > 0 && (
          <div className="text-sm">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">이번 주 일정</span>
            <span className="text-foreground">
              {scheduleSlots.map((s, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  {DAY_KO[s.day] ?? s.day} {s.start}–{s.end}
                </span>
              ))}
            </span>
          </div>
        )}

        {academy.location && (
          <div className="text-sm flex items-baseline gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider min-w-[60px]">위치</span>
            <span>{academy.location}</span>
          </div>
        )}

        {academy.notes && (
          <div className="text-sm flex items-baseline gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider min-w-[60px]">메모</span>
            <span className="whitespace-pre-wrap break-words">{academy.notes}</span>
          </div>
        )}

        {academy.extractionHint && (
          <div className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2 mt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider block mb-0.5">AI 힌트</span>
            “{academy.extractionHint}”
          </div>
        )}
      </Card>

      <Link
        href={`/homework/upload?academy=${numId}`}
        className={cn(buttonVariants(), 'w-full justify-center')}
      >
        + 이 학원 숙제 추가
      </Link>

      <ActiveAcademyItems items={active} todayIso={todayIso} />

      {/* Completed homework — collapsible, with undo */}
      {/* eslint-disable-next-line react-hooks/purity -- server component renders per-request; Date.now() is intentional */}
      <DoneAcademyItems items={done} now={Date.now()} />

      <BatchesRollback batches={batches} />
      </div>
    </div>
    </MultiSelectProvider>
  )
}
