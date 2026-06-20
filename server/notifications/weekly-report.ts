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
  ratedCount: number          // 별점 매긴 완료 수
  unscoredCount: number       // 미기록 완료 수
  avgStars: number | null     // 채점된 것들의 평균 별점(0~5), 없으면 null
  starDist: Record<number, number>  // {0..5: count}
  byAcademy: Record<string, { completed: number; late: number; rated: number; avgStars: number | null }>
  completed: Array<{ title: string; academyName: string; dueDate: string | null; doneAt: number; late: boolean; score: number | null; scoreReason: string | null }>
  openAtWeekEnd: number
  // 매일/매주 할일: 이번 주 예정(scheduled) 대비 완료(completed) + 별점.
  recurring: Array<{ title: string; cadence: 'daily' | 'weekly'; scheduled: number; completed: number; ratedCount: number; avgStars: number | null }>
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

  const starDist: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  const byAcademy: WeeklyStats['byAcademy'] = {}
  const acStarSum: Record<string, number> = {}
  let lateCount = 0
  let ratedCount = 0
  let unscoredCount = 0
  let sumStars = 0
  const completed = rows.map((r) => {
    const doneAtMs = (r.doneAt as Date).getTime()
    // 지연 = 완료한 로컬 날짜가 마감일보다 늦음.
    const doneDateIso = localIsoOf(r.doneAt as Date)
    const late = r.dueDate !== null && doneDateIso > r.dueDate
    if (late) lateCount++
    const score = r.score  // number(0~5) | null
    if (score !== null) {
      ratedCount++; sumStars += score
      if (score >= 0 && score <= 5) starDist[score]++
    } else {
      unscoredCount++
    }
    const a = (byAcademy[r.academyName] ??= { completed: 0, late: 0, rated: 0, avgStars: null })
    a.completed++
    if (late) a.late++
    if (score !== null) { a.rated++; acStarSum[r.academyName] = (acStarSum[r.academyName] ?? 0) + score }
    return { title: r.title, academyName: r.academyName, dueDate: r.dueDate, doneAt: doneAtMs, late, score, scoreReason: r.scoreReason }
  })
  completed.sort((x, y) => x.doneAt - y.doneAt)

  for (const [name, a] of Object.entries(byAcademy)) {
    a.avgStars = a.rated > 0 ? Math.round((acStarSum[name] / a.rated) * 10) / 10 : null
  }
  const avgStars = ratedCount > 0 ? Math.round((sumStars / ratedCount) * 10) / 10 : null

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

  // 매일/매주 할일: 활성 task별로 이번 주 예정 횟수 대비 완료 + 별점 평균.
  // 완료창은 completionDate ∈ [weekStart, weekEnd] — daily는 그 주의 날짜, weekly는
  // 그 주 월요일(=weekStartIso) 키라 둘 다 범위에 들어온다.
  const recTasks = db.select({
    id: schema.recurringTasks.id,
    title: schema.recurringTasks.title,
    cadence: schema.recurringTasks.cadence,
    daysOfWeek: schema.recurringTasks.daysOfWeek,
  }).from(schema.recurringTasks).where(isNull(schema.recurringTasks.archivedAt)).all()
  const recCompletions = db.select({
    taskId: schema.recurringTaskCompletions.taskId,
    score: schema.recurringTaskCompletions.score,
  }).from(schema.recurringTaskCompletions)
    .where(and(
      gte(schema.recurringTaskCompletions.completionDate, weekStartIso),
      lte(schema.recurringTaskCompletions.completionDate, weekEndIso),
    )).all()
  const recByTask = new Map<number, { count: number; rated: number; sum: number }>()
  for (const c of recCompletions) {
    const e = recByTask.get(c.taskId) ?? { count: 0, rated: 0, sum: 0 }
    e.count++
    if (c.score !== null) { e.rated++; e.sum += c.score }
    recByTask.set(c.taskId, e)
  }
  const recurring = recTasks.map((t) => {
    const days = Array.isArray(t.daysOfWeek) ? t.daysOfWeek : []
    const scheduled = t.cadence === 'weekly' ? 1 : days.length
    const e = recByTask.get(t.id) ?? { count: 0, rated: 0, sum: 0 }
    return {
      title: t.title,
      cadence: t.cadence,
      scheduled,
      completed: e.count,
      ratedCount: e.rated,
      avgStars: e.rated > 0 ? Math.round((e.sum / e.rated) * 10) / 10 : null,
    }
  }).filter((r) => r.scheduled > 0 || r.completed > 0)

  return {
    weekStartIso, weekEndIso,
    totalCompleted: completed.length,
    lateCount,
    ratedCount,
    unscoredCount,
    avgStars,
    starDist,
    byAcademy,
    completed,
    openAtWeekEnd: openRow?.c ?? 0,
    recurring,
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

function avgLabel(avg: number | null): string {
  return avg === null ? '미기록' : `평균 ${avg}/5`
}

function buildSummaryPrompt(s: WeeklyStats): string {
  const lines = s.completed.map((c) =>
    `- ${c.academyName} | ${c.title} | 별점:${c.score === null ? '미기록' : `${c.score}/5`}${c.late ? ' | 지연' : ''}${c.scoreReason ? ` | 이유:${c.scoreReason}` : ''}`,
  ).join('\n')
  const recLines = s.recurring.map((r) =>
    `- ${r.title}(${r.cadence === 'weekly' ? '매주' : '매일'}): ${r.scheduled}번 중 ${r.completed}번 완료${r.avgStars !== null ? `, 평균 ${r.avgStars}/5` : ''}`,
  ).join('\n')
  return [
    '너는 초등학생 자녀의 한 주 숙제 진행을 부모에게 요약해주는 비서야. 점수는 0~5 별점(5가 가장 잘함).',
    `기간: ${s.weekStartIso} ~ ${s.weekEndIso}`,
    `완료 ${s.totalCompleted}개 (지연 ${s.lateCount}개). 별점 ${avgLabel(s.avgStars)} (채점 ${s.ratedCount}, 미기록 ${s.unscoredCount}). 주말 시점 미완료 ${s.openAtWeekEnd}개.`,
    '완료 목록:',
    lines || '(없음)',
    '',
    '매일/매주 할일(이번 주 예정 대비 완료·별점):',
    recLines || '(없음)',
    '',
    '위 데이터를 바탕으로 한국어로 2~4문장 요약해줘. "무엇을 했는지"를 넘어 **얼마나 잘했고(별점·이유 반영), 무엇이 부족했는지(지연·낮은 별점·미완료)**를 구체적으로. 숙제뿐 아니라 매일/매주 할일의 수행률(예: 5번 중 3번)도 반영. 칭찬과 개선점을 균형있게. 과장 없이. 다른 머리말/마크다운 없이 문장만.',
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
  return `완료 ${s.totalCompleted}개 중 지연 ${s.lateCount}개. 별점 ${avgLabel(s.avgStars)}(채점 ${s.ratedCount}·미기록 ${s.unscoredCount}). 주말 미완료 ${s.openAtWeekEnd}개.`
}

/** 텔레그램 HTML + 화면 공용. parse_mode HTML에 안전하도록 &<>만 escape. */
function formatReportText(s: WeeklyStats, narrative: string): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const head = `📊 <b>주간 숙제 리포트</b> (${s.weekStartIso} ~ ${s.weekEndIso})`
  const summary = `완료 ${s.totalCompleted} · 지연 ${s.lateCount} · 주말 미완료 ${s.openAtWeekEnd}`
  const dist = `별점 ${avgLabel(s.avgStars)} · 채점 ${s.ratedCount} · 미기록 ${s.unscoredCount}`
  const byAc = Object.entries(s.byAcademy).map(([n, v]) => `· ${esc(n)}: 완료 ${v.completed} (지연 ${v.late}${v.avgStars !== null ? `, 평균 ${v.avgStars}★` : ''})`).join('\n')
  const recLines = s.recurring.length > 0
    ? '🔁 매일/매주 할일\n' + s.recurring.map((r) => `· ${esc(r.title)}: ${r.scheduled}번 중 ${r.completed}번${r.avgStars !== null ? ` · ★${r.avgStars}` : ''}`).join('\n')
    : null
  return [head, '', summary, dist, byAc, recLines, '', esc(narrative)].filter((l) => l !== null).join('\n')
}
