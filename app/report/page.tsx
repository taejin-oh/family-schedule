import { desc } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { Card } from '@/components/ui/card'
import { regenerateThisWeekReport } from './actions'

export const dynamic = 'force-dynamic'

type WeeklyStats = {
  totalCompleted?: number
  lateCount?: number
  openAtWeekEnd?: number
  ratedCount?: number
  unscoredCount?: number
  avgStars?: number | null
  starDist?: Record<number, number>
  byAcademy?: Record<string, { completed: number; late: number; rated?: number; avgStars?: number | null }>
}

export default async function ReportPage() {
  const db = getDb()
  const reports = db.select().from(schema.weeklyReports).orderBy(desc(schema.weeklyReports.generatedAt)).limit(10).all()

  const latest = reports[0] ?? null
  const history = reports.slice(1)

  return (
    <div className="space-y-4 lg:max-w-xl">
      <header className="px-1 pt-2 pb-1 flex items-end justify-between gap-2">
        <div>
          <h1 className="text-[30px] lg:text-[34px] leading-tight font-bold tracking-tight">📊 주간 리포트</h1>
          <p className="text-sm text-muted-foreground mt-0.5">이번 주 숙제 진행 요약</p>
        </div>
        <form action={regenerateThisWeekReport}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-2 bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            이번 주 리포트 생성/재생성
          </button>
        </form>
      </header>

      {latest ? (
        <ReportCard report={latest} label="최신 리포트" />
      ) : (
        <Card className="p-8 text-center text-muted-foreground space-y-2">
          <div className="text-2xl">📭</div>
          <div className="text-sm">아직 생성된 리포트가 없습니다.</div>
          <div className="text-xs">위 버튼으로 이번 주 리포트를 생성해보세요.</div>
        </Card>
      )}

      {history.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
            이전 리포트
          </h2>
          {history.map((r) => (
            <ReportCard key={r.id} report={r} label={null} />
          ))}
        </div>
      )}
    </div>
  )
}

function ReportCard({
  report,
  label,
}: {
  report: typeof schema.weeklyReports.$inferSelect
  label: string | null
}) {
  const stats = report.stats as WeeklyStats
  const generatedAt = new Date(report.generatedAt)

  return (
    <Card className="p-4 gap-3">
      {label && (
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </h2>
      )}
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold">
          {report.weekStartIso} ~ {report.weekEndIso}
        </div>
        <div className="text-xs text-muted-foreground">
          생성: {generatedAt.toLocaleDateString('ko-KR')} {generatedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* 통계 요약 */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-muted rounded-lg p-2">
          <div className="text-lg font-bold tabular-nums">{stats.totalCompleted ?? 0}</div>
          <div className="text-[11px] text-muted-foreground">완료</div>
        </div>
        <div className="bg-muted rounded-lg p-2">
          <div className="text-lg font-bold tabular-nums">{stats.lateCount ?? 0}</div>
          <div className="text-[11px] text-muted-foreground">지연</div>
        </div>
        <div className="bg-muted rounded-lg p-2">
          <div className="text-lg font-bold tabular-nums">{stats.openAtWeekEnd ?? 0}</div>
          <div className="text-[11px] text-muted-foreground">주말 미완료</div>
        </div>
      </div>

      {/* 별점 요약 */}
      {((stats.ratedCount ?? 0) + (stats.unscoredCount ?? 0)) > 0 && (
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="text-xs text-muted-foreground">별점</span>
          <span className="font-semibold text-amber-500">
            {stats.avgStars != null ? `평균 ★${stats.avgStars}` : '미기록'}
          </span>
          <span className="text-muted-foreground">채점 {stats.ratedCount ?? 0} · 미기록 {stats.unscoredCount ?? 0}</span>
          {stats.starDist && (
            <span className="text-xs text-muted-foreground ml-auto tabular-nums">
              {[5, 4, 3, 2, 1, 0].filter((n) => (stats.starDist?.[n] ?? 0) > 0).map((n) => `${n}★ ${stats.starDist![n]}`).join(' · ')}
            </span>
          )}
        </div>
      )}

      {/* 학원별 */}
      {stats.byAcademy && Object.keys(stats.byAcademy).length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">학원별</div>
          {Object.entries(stats.byAcademy).map(([name, v]) => (
            <div key={name} className="flex items-center justify-between text-sm">
              <span>{name}</span>
              <span className="text-muted-foreground tabular-nums">
                완료 {v.completed}{v.late > 0 ? ` · 지연 ${v.late}` : ''}{v.avgStars != null ? ` · ★${v.avgStars}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* AI 서술 */}
      <div className="border-t border-foreground/10 pt-3 space-y-1">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          서술 {report.model !== 'template' ? `(${report.model})` : '(템플릿)'}
        </div>
        <p className="text-sm leading-relaxed">{report.narrative}</p>
      </div>
    </Card>
  )
}
