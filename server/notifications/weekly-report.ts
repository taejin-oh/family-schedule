import { drizzle } from 'drizzle-orm/better-sqlite3'
import { and, eq, isNull, gte, lt, isNotNull, lte, count } from 'drizzle-orm'
import * as schema from '@/server/db/schema'
import { runTextLLM } from '@/server/llm/text'

type AppDb = ReturnType<typeof drizzle<typeof schema>>

export type WeeklyStats = {
  weekStartIso: string
  weekEndIso: string
  totalCompleted: number
  lateCount: number
  scoreDist: { '상': number; '중': number; '하': number; '미기록': number }
  byAcademy: Record<string, { completed: number; late: number; '상': number; '중': number; '하': number }>
  completed: Array<{ title: string; academyName: string; dueDate: string | null; doneAt: number; late: boolean; score: string | null; scoreReason: string | null }>
  openAtWeekEnd: number
}

/** weekStartIso=월요일, weekEndIso=일요일(둘 다 'YYYY-MM-DD', 로컬). 완료창=[월 00:00, 다음 월 00:00). */
export function gatherWeeklyStats(db: AppDb, weekStartIso: string, weekEndIso: string): WeeklyStats {
  const start = new Date(weekStartIso + 'T00:00:00')
  const end = new Date(start); end.setDate(end.getDate() + 7)

  const rows = db.select({
    title: schema.homeworkItems.title,
    dueDate: schema.homeworkItems.dueDate,
    doneAt: schema.homeworkItems.doneAt,
    score: schema.homeworkItems.score,
    scoreReason: schema.homeworkItems.scoreReason,
    academyName: schema.academies.name,
  })
  .from(schema.homeworkItems)
  .innerJoin(schema.academies, eq(schema.homeworkItems.academyId, schema.academies.id))
  .where(and(
    eq(schema.homeworkItems.isCommitted, true),
    isNotNull(schema.homeworkItems.doneAt),
    gte(schema.homeworkItems.doneAt, start),
    lt(schema.homeworkItems.doneAt, end),
  ))
  .all()

  const scoreDist = { '상': 0, '중': 0, '하': 0, '미기록': 0 }
  const byAcademy: WeeklyStats['byAcademy'] = {}
  let lateCount = 0
  const completed = rows.map((r) => {
    const doneAtMs = (r.doneAt as Date).getTime()
    // 지연 = 완료한 로컬 날짜가 마감일보다 늦음.
    const doneDateIso = localIsoOf(r.doneAt as Date)
    const late = r.dueDate !== null && doneDateIso > r.dueDate
    if (late) lateCount++
    const key = (r.score ?? '미기록') as keyof typeof scoreDist
    scoreDist[key]++
    const a = (byAcademy[r.academyName] ??= { completed: 0, late: 0, '상': 0, '중': 0, '하': 0 })
    a.completed++
    if (late) a.late++
    if (r.score === '상' || r.score === '중' || r.score === '하') a[r.score]++
    return { title: r.title, academyName: r.academyName, dueDate: r.dueDate, doneAt: doneAtMs, late, score: r.score, scoreReason: r.scoreReason }
  })
  completed.sort((x, y) => x.doneAt - y.doneAt)

  // 주말(일요일) 시점 미완료: committed & 미완료 & dueDate ≤ weekEnd.
  const openRow = db.select({ c: count() })
    .from(schema.homeworkItems)
    .where(and(
      eq(schema.homeworkItems.isCommitted, true),
      isNull(schema.homeworkItems.doneAt),
      isNotNull(schema.homeworkItems.dueDate),
      lte(schema.homeworkItems.dueDate, weekEndIso),
    ))
    .get()

  return {
    weekStartIso, weekEndIso,
    totalCompleted: completed.length,
    lateCount,
    scoreDist,
    byAcademy,
    completed,
    openAtWeekEnd: openRow?.c ?? 0,
  }
}

function localIsoOf(d: Date): string {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type SummarizeOpts = {
  provider: string
  model: string
  // 테스트용 주입. 기본은 실제 runTextLLM.
  run?: (prompt: string, o: { provider: string; model: string }) => Promise<string>
}

export async function summarizeWeek(stats: WeeklyStats, opts: SummarizeOpts): Promise<string | null> {
  const run = opts.run ?? ((p, o) => runTextLLM(p, o))
  const prompt = buildSummaryPrompt(stats)
  try {
    const out = await run(prompt, { provider: opts.provider, model: opts.model })
    const trimmed = out.trim()
    return trimmed || null
  } catch {
    return null
  }
}

function buildSummaryPrompt(s: WeeklyStats): string {
  const lines = s.completed.map((c) =>
    `- ${c.academyName} | ${c.title} | 점수:${c.score ?? '미기록'}${c.late ? ' | 지연' : ''}${c.scoreReason ? ` | 이유:${c.scoreReason}` : ''}`,
  ).join('\n')
  return [
    '너는 초등학생 자녀의 한 주 숙제 진행을 부모에게 요약해주는 비서야.',
    `기간: ${s.weekStartIso} ~ ${s.weekEndIso}`,
    `완료 ${s.totalCompleted}개 (지연 ${s.lateCount}개). 점수 분포 — 상 ${s.scoreDist['상']}, 중 ${s.scoreDist['중']}, 하 ${s.scoreDist['하']}, 미기록 ${s.scoreDist['미기록']}. 주말 시점 미완료 ${s.openAtWeekEnd}개.`,
    '완료 목록:',
    lines || '(없음)',
    '',
    '위 데이터를 바탕으로 한국어로 2~4문장 요약해줘. "무엇을 했는지"를 넘어 **얼마나 잘했고(상/중/하·이유 반영), 무엇이 부족했는지(지연·하·미완료)**를 구체적으로. 칭찬과 개선점을 균형있게. 과장 없이. 다른 머리말/마크다운 없이 문장만.',
  ].join('\n')
}

type BuildOpts = SummarizeOpts & { now?: number }

export async function buildWeeklyReport(
  db: AppDb, weekStartIso: string, weekEndIso: string, opts: BuildOpts,
): Promise<{ stats: WeeklyStats; narrative: string; text: string; model: string }> {
  const stats = gatherWeeklyStats(db, weekStartIso, weekEndIso)
  const ai = await summarizeWeek(stats, opts)
  const narrative = ai ?? templateNarrative(stats)
  const model = ai ? `${opts.provider}/${opts.model}` : 'template'
  const text = formatReportText(stats, narrative)
  const now = opts.now ?? Date.now()
  db.insert(schema.weeklyReports)
    .values({ weekStartIso, weekEndIso, stats: stats as unknown as Record<string, unknown>, narrative, model, generatedAt: new Date(now) })
    .onConflictDoUpdate({
      target: schema.weeklyReports.weekStartIso,
      set: { weekEndIso, stats: stats as unknown as Record<string, unknown>, narrative, model, generatedAt: new Date(now) },
    })
    .run()
  return { stats, narrative, text, model }
}

function templateNarrative(s: WeeklyStats): string {
  return `완료 ${s.totalCompleted}개 중 지연 ${s.lateCount}개. 점수 — 상 ${s.scoreDist['상']}, 중 ${s.scoreDist['중']}, 하 ${s.scoreDist['하']}, 미기록 ${s.scoreDist['미기록']}. 주말 미완료 ${s.openAtWeekEnd}개.`
}

/** 텔레그램 HTML + 화면 공용. parse_mode HTML에 안전하도록 &<>만 escape. */
function formatReportText(s: WeeklyStats, narrative: string): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const head = `📊 <b>주간 숙제 리포트</b> (${s.weekStartIso} ~ ${s.weekEndIso})`
  const summary = `완료 ${s.totalCompleted} · 지연 ${s.lateCount} · 주말 미완료 ${s.openAtWeekEnd}`
  const dist = `점수 — 상 ${s.scoreDist['상']} / 중 ${s.scoreDist['중']} / 하 ${s.scoreDist['하']} / 미기록 ${s.scoreDist['미기록']}`
  const byAc = Object.entries(s.byAcademy).map(([n, v]) => `· ${esc(n)}: 완료 ${v.completed} (지연 ${v.late})`).join('\n')
  return [head, '', summary, dist, byAc, '', esc(narrative)].filter((l) => l !== null).join('\n')
}
