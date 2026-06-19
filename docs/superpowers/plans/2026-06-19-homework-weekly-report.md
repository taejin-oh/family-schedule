# Homework Weekly Report Implementation Plan (Phase 2 + 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 주 숙제 진행(완료/지연/상·중·하 점수/이유)에 대한 리포트를 만들고, 일요일 21:00 텔레그램 자동 발송 + 앱 `/report` 페이지(언제든 재생성) + on-demand agent API로 받는다. 정성 서술은 기존 codex/claude 서브프로세스($0)로 생성, 실패 시 템플릿 폴백.

**Architecture:** 결정적 집계(`gatherWeeklyStats`) + 텍스트 전용 LLM(`runTextLLM`) 위에 `summarizeWeek`(서술) → `buildWeeklyReport`(조립+`weekly_reports` upsert). 전달은 worker(`maybeFireWeekly`, 일요일/시간 게이트 + `digest_log` dedup), `/report` 페이지, `/api/agent/report/weekly`.

**Tech Stack:** Next.js 16 App Router, Drizzle + better-sqlite3, vitest. LLM은 `codex exec`/`claude -p` 서브프로세스. 마이그레이션 `pnpm db:generate`.

**Spec:** `docs/superpowers/specs/2026-06-19-homework-scoring-weekly-report-design.md` (Part B).

**전제(이미 배포됨):** `homework_items.score`/`scoreReason` 컬럼, `server/util/date.ts`(`localDateIso`,`mondayOfWeekIso`,`localWeekWindow`).

**운영 규칙(메모리):** 라이브 디렉토리에서 빌드 후 반드시 `launchctl kickstart -k gui/$(id -u)/com.taejin.family-schedule` 재시작.

**Phasing:** Phase 2(Task 1–5, 리포트 코어) → Phase 3(Task 6–10, 전달·배포). 각 Task TDD·작은 커밋.

---

## Task 1: `weekly_reports` 테이블 + 마이그레이션

**Files:** Modify `server/db/schema.ts`; Create migration (drizzle-kit).

- [ ] **Step 1: 테이블 추가** — `server/db/schema.ts` 끝(다른 테이블 곁)에:

```ts
export const weeklyReports = sqliteTable('weekly_reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  weekStartIso: text('week_start_iso').notNull().unique(),  // 월요일 'YYYY-MM-DD'
  weekEndIso: text('week_end_iso').notNull(),               // 일요일 'YYYY-MM-DD'
  stats: text('stats', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  narrative: text('narrative').notNull(),
  model: text('model').notNull(),                           // 'codex/gpt-5.5' 또는 'template'
  generatedAt: integer('generated_at', { mode: 'timestamp' }).notNull(),
})
```

- [ ] **Step 2: 마이그레이션 생성** — Run: `pnpm db:generate` → `server/db/migrations/00NN_*.sql`에 `CREATE TABLE weekly_reports ...` 생성.
- [ ] **Step 3: 타입체크** — Run: `pnpm typecheck` → PASS.
- [ ] **Step 4: Commit**
```bash
git add server/db/schema.ts server/db/migrations
git commit -m "feat(report): weekly_reports 테이블 + 마이그레이션"
```

---

## Task 2: `gatherWeeklyStats` (TDD)

**Files:** Create `server/notifications/weekly-report.ts`; Create `tests/notifications/weekly-report.test.ts`.

- [ ] **Step 1: 실패 테스트 작성** — `tests/notifications/weekly-report.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as appSchema from '@/server/db/schema'
import { gatherWeeklyStats } from '@/server/notifications/weekly-report'

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-wr-'))
  const sqlite = new Database(join(dir, 'app.db')); sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema: appSchema })
  migrate(db, { migrationsFolder: './server/db/migrations' })
  return db
}
function seedAcademy(db: ReturnType<typeof makeDb>, name: string) {
  const [a] = db.insert(appSchema.academies).values({ name, subject: 'math', color: '#000' }).returning().all()
  const [b] = db.insert(appSchema.homeworkBatches).values({ academyId: a.id, status: 'committed' }).returning().all()
  return { academyId: a.id, batchId: b.id }
}
function seedItem(db: ReturnType<typeof makeDb>, ctx: { academyId: number; batchId: number }, o: {
  title: string; dueDate?: string | null; doneAt?: Date | null; score?: '상'|'중'|'하'|null
}) {
  db.insert(appSchema.homeworkItems).values({
    batchId: ctx.batchId, academyId: ctx.academyId, title: o.title, source: 'manual',
    isCommitted: true, dueDate: o.dueDate ?? null, doneAt: o.doneAt ?? null, score: o.score ?? null,
  }).run()
}

describe('gatherWeeklyStats', () => {
  it('주 안에 완료된 숙제만 집계하고 점수 분포·지연을 계산한다', () => {
    const db = makeDb()
    const eng = seedAcademy(db, '영어')
    // 주: 2026-06-15(월) ~ 2026-06-21(일). 완료시각은 그 주 안.
    const inWeek = new Date('2026-06-17T10:00:00')
    seedItem(db, eng, { title: '제때 완료 상', dueDate: '2026-06-18', doneAt: inWeek, score: '상' })   // 마감 전 완료
    seedItem(db, eng, { title: '지연 완료 하', dueDate: '2026-06-16', doneAt: inWeek, score: '하' })   // 마감 후 완료(지연)
    seedItem(db, eng, { title: '점수 미기록', dueDate: '2026-06-18', doneAt: inWeek, score: null })
    seedItem(db, eng, { title: '지난 주 완료', dueDate: '2026-06-10', doneAt: new Date('2026-06-10T10:00:00') }) // 제외
    seedItem(db, eng, { title: '미완료', dueDate: '2026-06-19', doneAt: null })                          // 완료 아님 → 제외

    const s = gatherWeeklyStats(db, '2026-06-15', '2026-06-21')
    expect(s.totalCompleted).toBe(3)
    expect(s.lateCount).toBe(1)
    expect(s.scoreDist).toEqual({ '상': 1, '중': 0, '하': 1, '미기록': 1 })
    expect(s.byAcademy['영어'].completed).toBe(3)
    expect(s.completed.map((c) => c.title)).toContain('제때 완료 상')
    expect(s.completed.map((c) => c.title)).not.toContain('지난 주 완료')
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm exec vitest run tests/notifications/weekly-report.test.ts` → FAIL (not exported).

- [ ] **Step 3: 구현** — `server/notifications/weekly-report.ts`:

```ts
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { and, eq, isNull, gte, lt, isNotNull, lte, count } from 'drizzle-orm'
import * as schema from '@/server/db/schema'

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
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm exec vitest run tests/notifications/weekly-report.test.ts` → PASS.
- [ ] **Step 5: Commit**
```bash
git add server/notifications/weekly-report.ts tests/notifications/weekly-report.test.ts
git commit -m "feat(report): gatherWeeklyStats 주간 집계 + 테스트"
```

---

## Task 3: `runTextLLM` 텍스트 전용 LLM 호출

**Files:** Create `server/llm/text.ts`.

- [ ] **Step 1: 구현** — 이미지 없이 codex/claude를 텍스트로 호출. `server/llm/codex.ts`/`claude-cli.ts`의 서브프로세스 패턴을 그대로 따른다(특히 codex는 prompt를 **stdin으로 전달 후 close**, `-o` 파일에서 결과 읽기).

```ts
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type TextLLMOpts = { provider: string; model: string; timeoutMs?: number }

/** 이미지 없는 텍스트 생성. provider 'codex' → codex exec, 그 외 → claude -p. */
export function runTextLLM(prompt: string, opts: TextLLMOpts): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 120_000
  return opts.provider === 'codex'
    ? runCodexText(prompt, opts.model, timeoutMs)
    : runClaudeText(prompt, opts.model, timeoutMs)
}

function runCodexText(prompt: string, model: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const outFile = join(tmpdir(), `codex-rep-${process.pid}-${Date.now()}.txt`)
    const proc = spawn('codex', ['exec', '-m', model, '--sandbox', 'read-only', '--skip-git-repo-check', '-o', outFile], {
      stdio: 'pipe', cwd: tmpdir(), env: process.env,
    }) as ChildProcessWithoutNullStreams
    proc.stdin.write(prompt); proc.stdin.end()
    let stdout = ''; let stderr = ''; let settled = false
    const settle = (fn: () => void) => { if (settled) return; settled = true; fn() }
    const t = setTimeout(() => { proc.kill('SIGTERM'); settle(() => reject(new Error(`codex text timed out after ${timeoutMs}ms`))) }, timeoutMs)
    proc.stdout.on('data', (b) => { stdout += b.toString() })
    proc.stderr.on('data', (b) => { stderr += b.toString() })
    proc.on('error', (err) => { clearTimeout(t); settle(() => reject(err)) })
    proc.on('close', (code) => {
      clearTimeout(t)
      if (code !== 0) { settle(() => reject(new Error(`codex exited ${code}; ${stderr.slice(0, 300)}`))); return }
      let raw = stdout
      try { const f = readFileSync(outFile, 'utf8'); if (f.trim()) raw = f } catch { /* stdout fallback */ }
      try { unlinkSync(outFile) } catch { /* ignore */ }
      settle(() => resolve(raw.trim()))
    })
  })
}

function runClaudeText(prompt: string, model: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', prompt, '--model', model, '--output-format', 'text'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''; let settled = false
    const settle = (fn: () => void) => { if (settled) return; settled = true; fn() }
    const t = setTimeout(() => { proc.kill('SIGTERM'); settle(() => reject(new Error(`claude text timed out after ${timeoutMs}ms`))) }, timeoutMs)
    proc.stdout?.on('data', (b) => { stdout += b.toString() })
    proc.stderr?.on('data', (b) => { stderr += b.toString() })
    proc.on('error', (err) => { clearTimeout(t); settle(() => reject(err)) })
    proc.on('close', (code) => {
      clearTimeout(t)
      if (code === 0) settle(() => resolve(stdout.trim()))
      else settle(() => reject(new Error(`claude exited ${code}; ${stderr.slice(0, 300)}`)))
    })
  })
}
```

- [ ] **Step 2: 타입체크/린트** — Run: `pnpm typecheck && pnpm exec eslint server/llm/text.ts` → PASS, exit 0.
> 실제 CLI 호출은 단위테스트하지 않는다(통합). 다음 Task에서 `summarizeWeek`가 이 함수를 주입형으로 받아 stub으로 테스트한다.
- [ ] **Step 3: Commit**
```bash
git add server/llm/text.ts
git commit -m "feat(report): runTextLLM 텍스트 전용 codex/claude 호출"
```

---

## Task 4: `summarizeWeek` (TDD, 주입형 러너)

**Files:** Modify `server/notifications/weekly-report.ts`; Modify test.

- [ ] **Step 1: 실패 테스트 추가** — 테스트 파일에:

```ts
import { summarizeWeek } from '@/server/notifications/weekly-report'

const FAKE_STATS = {
  weekStartIso: '2026-06-15', weekEndIso: '2026-06-21', totalCompleted: 3, lateCount: 1,
  scoreDist: { '상': 1, '중': 0, '하': 1, '미기록': 1 }, byAcademy: {}, completed: [], openAtWeekEnd: 2,
}

describe('summarizeWeek', () => {
  it('주입한 러너의 서술을 트림해서 반환', async () => {
    const run = async () => '  이번 주 잘했어요.  '
    const out = await summarizeWeek(FAKE_STATS as never, { provider: 'codex', model: 'gpt-5.5', run })
    expect(out).toBe('이번 주 잘했어요.')
  })
  it('러너가 throw하면 null', async () => {
    const run = async () => { throw new Error('cli fail') }
    const out = await summarizeWeek(FAKE_STATS as never, { provider: 'codex', model: 'gpt-5.5', run })
    expect(out).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm exec vitest run tests/notifications/weekly-report.test.ts -t summarizeWeek` → FAIL.

- [ ] **Step 3: 구현** — `weekly-report.ts`에 추가(상단에 `import { runTextLLM } from '@/server/llm/text'`):

```ts
import type { WeeklyStats } from './weekly-report'  // (동일 파일이면 import 불필요)

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
```

> 주의: `WeeklyStats`와 `summarizeWeek`가 같은 파일이면 `import type { WeeklyStats }` 줄은 빼고 위 타입을 그대로 쓴다.

- [ ] **Step 4: 통과 확인** — Run: `pnpm exec vitest run tests/notifications/weekly-report.test.ts` → 모두 PASS.
- [ ] **Step 5: Commit**
```bash
git add server/notifications/weekly-report.ts tests/notifications/weekly-report.test.ts
git commit -m "feat(report): summarizeWeek AI 서술(주입형) + 테스트"
```

---

## Task 5: `buildWeeklyReport` (TDD, 폴백 + upsert)

**Files:** Modify `server/notifications/weekly-report.ts`; Modify test.

- [ ] **Step 1: 실패 테스트 추가**:

```ts
import { eq } from 'drizzle-orm'
import { buildWeeklyReport } from '@/server/notifications/weekly-report'

describe('buildWeeklyReport', () => {
  it('서술 생성 + weekly_reports upsert + 텍스트에 통계·서술 포함', async () => {
    const db = makeDb()
    const eng = seedAcademy(db, '영어')
    seedItem(db, eng, { title: 'A', dueDate: '2026-06-18', doneAt: new Date('2026-06-17T10:00:00'), score: '상' })
    const run = async () => 'AI 서술: 영어 숙제를 성실히 끝냈어요.'
    const r = await buildWeeklyReport(db, '2026-06-15', '2026-06-21', { provider: 'codex', model: 'gpt-5.5', run, now: 1_750_000_000_000 })
    expect(r.text).toContain('완료')
    expect(r.text).toContain('AI 서술')
    const row = db.select().from(appSchema.weeklyReports).where(eq(appSchema.weeklyReports.weekStartIso, '2026-06-15')).get()
    expect(row?.narrative).toContain('AI 서술')
    expect(row?.model).toBe('codex/gpt-5.5')
  })
  it('LLM 실패 시 템플릿 폴백으로도 저장·발송 가능', async () => {
    const db = makeDb()
    const eng = seedAcademy(db, '영어')
    seedItem(db, eng, { title: 'A', dueDate: '2026-06-18', doneAt: new Date('2026-06-17T10:00:00'), score: '상' })
    const run = async () => { throw new Error('fail') }
    const r = await buildWeeklyReport(db, '2026-06-15', '2026-06-21', { provider: 'codex', model: 'gpt-5.5', run, now: 1_750_000_000_000 })
    expect(r.model).toBe('template')
    expect(r.text.length).toBeGreaterThan(0)
    const row = db.select().from(appSchema.weeklyReports).where(eq(appSchema.weeklyReports.weekStartIso, '2026-06-15')).get()
    expect(row).toBeTruthy()
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm exec vitest run tests/notifications/weekly-report.test.ts -t buildWeeklyReport` → FAIL.

- [ ] **Step 3: 구현** — `weekly-report.ts`에 추가:

```ts
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
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm exec vitest run tests/notifications/weekly-report.test.ts` → 모두 PASS.
- [ ] **Step 5: Commit**
```bash
git add server/notifications/weekly-report.ts tests/notifications/weekly-report.test.ts
git commit -m "feat(report): buildWeeklyReport 조립+upsert(템플릿 폴백) + 테스트"
```

---

## Task 6: 설정 — weekly 토글/시간 (컬럼 + 액션 + UI)

**Files:** Modify `server/db/schema.ts` (+migration), `server/actions/settings.ts`, `app/admin/settings/page.tsx`(또는 설정 폼 컴포넌트).

- [ ] **Step 1: 컬럼 추가** — `appSettings`에 (telegramMidday 곁):
```ts
  telegramWeeklyEnabled: integer('telegram_weekly_enabled', { mode: 'boolean' }).notNull().default(true),
  telegramWeeklyTime: text('telegram_weekly_time').notNull().default('21:00'),
```
- [ ] **Step 2: 마이그레이션** — Run: `pnpm db:generate`.
- [ ] **Step 3: settings 액션** — `server/actions/settings.ts` `getSettings` 기본값 객체에 `telegramWeeklyEnabled: true, telegramWeeklyTime: '21:00'` 추가. `Input` zod에 `telegramWeeklyEnabled: z.boolean().optional(), telegramWeeklyTime: timeHHMM.optional()` 추가(`updateSettings`는 `parsed.data`를 set하므로 자동 반영 — 단 set 대상에 명시적으로 넣는 구조면 두 필드 추가).
- [ ] **Step 4: 설정 UI** — `app/admin/settings`의 저녁(evening) 토글/시간 입력 줄을 그대로 본떠 "주간 리포트 (일요일)" 토글 + 시간 입력 1줄 추가. 필드명 `telegramWeeklyEnabled`/`telegramWeeklyTime`.
- [ ] **Step 5: 타입체크/린트/테스트** — Run: `pnpm typecheck && pnpm exec eslint server/actions/settings.ts && pnpm test` → PASS (settings 관련 기존 테스트 포함).
- [ ] **Step 6: Commit**
```bash
git add server/db/schema.ts server/db/migrations server/actions/settings.ts app/admin/settings
git commit -m "feat(report): weekly 텔레그램 설정(토글/시간)"
```

---

## Task 7: worker `maybeFireWeekly` + `digest_log` kind 'weekly' (TDD)

**Files:** Modify `server/jobs/schema.ts`; Modify `server/worker/run.ts`; Create `tests/worker/weekly-fire.test.ts`.

- [ ] **Step 1: digest_log kind 확장** — `server/jobs/schema.ts` `digestLog.kind` enum을 `['morning', 'evening', 'midday', 'weekly']`로.

- [ ] **Step 2: 실패 테스트** — `tests/worker/weekly-fire.test.ts` (maybeFireWeekly를 주입형 deps로 테스트: 일요일/시간 게이트 + dedup):

```ts
import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'
import Database from 'better-sqlite3'; import { drizzle } from 'drizzle-orm/better-sqlite3'; import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as appSchema from '@/server/db/schema'; import * as jobsSchema from '@/server/jobs/schema'
import { maybeFireWeekly } from '@/server/worker/run'

function makeDbs() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-wf-'))
  const appDb = drizzle(new Database(join(dir, 'app.db')), { schema: appSchema }); migrate(appDb, { migrationsFolder: './server/db/migrations' })
  const jobsDb = drizzle(new Database(join(dir, 'jobs.db')), { schema: jobsSchema }); migrate(jobsDb, { migrationsFolder: './server/jobs/migrations' })
  return { appDb, jobsDb }
}

describe('maybeFireWeekly', () => {
  it('일요일 아님 → skipped', async () => {
    const { appDb, jobsDb } = makeDbs()
    const send = vi.fn(async () => ({ ok: true }))
    const build = vi.fn(async () => ({ text: 'x' }))
    // 2026-06-20 = 토요일
    const r = await maybeFireWeekly(appDb, jobsDb, true, '21:00', '21:00', '2026-06-20', { build, send })
    expect(r).toBe('skipped'); expect(send).not.toHaveBeenCalled()
  })
  it('일요일 21:00 → 1회 발송, 재호출은 dedup으로 skipped', async () => {
    const { appDb, jobsDb } = makeDbs()
    const send = vi.fn(async () => ({ ok: true }))
    const build = vi.fn(async () => ({ text: '리포트' }))
    // 2026-06-21 = 일요일
    const r1 = await maybeFireWeekly(appDb, jobsDb, true, '21:00', '21:00', '2026-06-21', { build, send })
    const r2 = await maybeFireWeekly(appDb, jobsDb, true, '21:00', '21:00', '2026-06-21', { build, send })
    expect(r1).toBe('sent'); expect(r2).toBe('skipped'); expect(send).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: 실패 확인** — Run: `pnpm exec vitest run tests/worker/weekly-fire.test.ts` → FAIL.

- [ ] **Step 4: 구현** — `server/worker/run.ts`에 export 추가. `maybeFireDigest`의 race-safe claim 패턴을 그대로 따르되 일요일 게이트 + 주입형 build/send. 상단 import에 `buildWeeklyReport` (`@/server/notifications/weekly-report`), `mondayOfWeekIso`/`localDateIso` (`@/server/util/date`) 추가:

```ts
type WeeklyDeps = {
  build?: (mondayIso: string, sundayIso: string) => Promise<{ text: string }>
  send?: (text: string) => Promise<{ ok: boolean; reason?: string }>
}

export async function maybeFireWeekly(
  appDb: AppDb, jobsDb: JobsDb, enabled: boolean, scheduledTime: string,
  currentHhmm: string, dateIso: string, deps: WeeklyDeps = {},
): Promise<DigestResult> {
  if (!enabled || scheduledTime !== currentHhmm) return 'skipped'
  // 일요일만 (로컬 파싱). getDay() 0 = 일요일.
  if (new Date(dateIso + 'T00:00:00').getDay() !== 0) return 'skipped'

  const send = deps.send ?? sendTelegram
  const build = deps.build ?? (async (monday: string, sunday: string) => {
    const settings = appDb.select().from(appSchema.appSettings).where(eq(appSchema.appSettings.id, 1)).get()
    const r = await buildWeeklyReport(appDb, monday, sunday, {
      provider: settings?.visionProvider ?? 'codex',
      model: settings?.visionModel ?? 'gpt-5.5',
    })
    return { text: r.text }
  })

  // dedup: digest_log (kind='weekly', dateIso=그 일요일).
  const ourNonce = Date.now() * 1000 + Math.floor(Math.random() * 1000)
  try {
    jobsDb.insert(jobsSchema.digestLog).values({ kind: 'weekly', sentAt: ourNonce, dateIso }).onConflictDoNothing().run()
  } catch (e) { console.error('[weekly] claim insert failed:', e); return 'retry' }
  let claimed = false
  try {
    const row = jobsDb.select({ sentAt: jobsSchema.digestLog.sentAt }).from(jobsSchema.digestLog)
      .where(and(eq(jobsSchema.digestLog.kind, 'weekly'), eq(jobsSchema.digestLog.dateIso, dateIso))).get()
    claimed = row?.sentAt === ourNonce
  } catch (e) { console.error('[weekly] claim verify failed:', e); return 'retry' }
  if (!claimed) return 'skipped'

  // 그 일요일이 끝나는 주 = 월요일~그 일요일. mondayOfWeekIso(dateIso).
  let text: string
  try {
    const monday = mondayOfWeekIso(dateIso)
    const out = await build(monday, dateIso)
    text = out.text
  } catch (e) {
    console.error('[weekly] build failed:', e)
    jobsDb.delete(jobsSchema.digestLog).where(and(eq(jobsSchema.digestLog.kind, 'weekly'), eq(jobsSchema.digestLog.dateIso, dateIso))).run()
    return 'retry'
  }
  const result = await send(text)
  if (!result.ok) {
    jobsDb.delete(jobsSchema.digestLog).where(and(eq(jobsSchema.digestLog.kind, 'weekly'), eq(jobsSchema.digestLog.dateIso, dateIso))).run()
    return 'retry'
  }
  console.log(`[weekly] report sent for week ending ${dateIso}`)
  return 'sent'
}
```

- [ ] **Step 5: 폴링 루프에 연결** — `runWorker`의 `eveningRes` 다음 줄에:
```ts
          const weeklyRes = await maybeFireWeekly(appDb, jobsDb, settings.telegramWeeklyEnabled, settings.telegramWeeklyTime, hhmm, dateIso)
```
그리고 retry 재진입 가드에 포함:
```ts
          if (morningRes === 'retry' || eveningRes === 'retry' || weeklyRes === 'retry') {
            lastCheckedMinute = ''
          }
```

- [ ] **Step 6: 통과 확인** — Run: `pnpm exec vitest run tests/worker/weekly-fire.test.ts && pnpm typecheck` → PASS.
- [ ] **Step 7: Commit**
```bash
git add server/jobs/schema.ts server/worker/run.ts tests/worker/weekly-fire.test.ts
git commit -m "feat(report): worker 일요일 21:00 주간 리포트 발송(dedup) + 테스트"
```

---

## Task 8: `/report` 페이지 + 재생성 액션

**Files:** Create `app/report/page.tsx`; Create `app/report/_actions.ts` (또는 page 내 'use server'); Modify `app/page.tsx`(헤더 링크).

- [ ] **Step 1: 재생성 server action** — `app/report/actions.ts`:
```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/server/db/client'
import { getSettings } from '@/server/actions/settings'
import { buildWeeklyReport } from '@/server/notifications/weekly-report'
import { mondayOfWeekIso, localDateIso } from '@/server/util/date'

export async function regenerateThisWeekReport() {
  const db = getDb()
  const settings = await getSettings()
  const today = localDateIso()
  const monday = mondayOfWeekIso(today)
  const sunday = (() => { const d = new Date(monday + 'T00:00:00'); d.setDate(d.getDate() + 6); return localDateIso(d) })()
  await buildWeeklyReport(db, monday, sunday, { provider: settings.visionProvider, model: settings.visionModel })
  revalidatePath('/report')
}
```

- [ ] **Step 2: 페이지** — `app/report/page.tsx` (서버 컴포넌트, `export const dynamic = 'force-dynamic'`): `weekly_reports`를 generatedAt desc로 읽어 최신 + 이력 표시(섹션별 통계 + 서술). 상단에 `regenerateThisWeekReport`를 호출하는 `<form action={...}>` 버튼("이번 주 리포트 생성/재생성"). 각 리포트 카드는 `stats`(json)와 `narrative`로 렌더. (학원별·점수분포·완료/지연·서술.)
- [ ] **Step 3: 홈 링크** — `app/page.tsx` 헤더(`🧒 은채 화면` 곁)에 `<Link href="/report" ...>📊 리포트</Link>` 추가.
- [ ] **Step 4: 타입체크/린트** — Run: `pnpm typecheck && pnpm exec eslint app/report app/page.tsx` → PASS.
- [ ] **Step 5: Commit**
```bash
git add app/report app/page.tsx
git commit -m "feat(report): /report 페이지 + 이번 주 재생성 버튼 + 홈 링크"
```

---

## Task 9: on-demand agent API + lulu SKILL.md

**Files:** Create `app/api/agent/report/weekly/route.ts`; Modify lulu `~/.openclaw/workspace/skills/family-schedule/SKILL.md`.

- [ ] **Step 1: 라우트** — `app/api/agent/report/weekly/route.ts` (기존 agent 라우트 패턴):
```ts
import { NextResponse } from 'next/server'
import { getDb } from '@/server/db/client'
import { getSettings } from '@/server/actions/settings'
import { buildWeeklyReport } from '@/server/notifications/weekly-report'
import { sendTelegram } from '@/server/notifications/telegram'
import { mondayOfWeekIso, localDateIso } from '@/server/util/date'
import { checkAgentAuth } from '../../_auth'

/** POST /api/agent/report/weekly — 이번 주 리포트 생성 + 텔레그램 발송. */
export async function POST(req: Request) {
  const auth = checkAgentAuth(req)
  if (auth) return auth
  const db = getDb()
  const settings = await getSettings()
  const monday = mondayOfWeekIso(localDateIso())
  const sunday = (() => { const d = new Date(monday + 'T00:00:00'); d.setDate(d.getDate() + 6); return localDateIso(d) })()
  const r = await buildWeeklyReport(db, monday, sunday, { provider: settings.visionProvider, model: settings.visionModel })
  const sent = await sendTelegram(r.text)
  return NextResponse.json({ ok: true, weekStartIso: monday, weekEndIso: sunday, sent: sent.ok })
}
```
> import 경로의 `../../_auth` 깊이는 실제 위치(`app/api/agent/report/weekly/route.ts` → `app/api/agent/_auth.ts`)에 맞춰 `../../../_auth`인지 확인(세그먼트 수 세어 조정).

- [ ] **Step 2: lulu SKILL.md 갱신** — `~/.openclaw/workspace/skills/family-schedule/SKILL.md`에 새 엔드포인트 문서화: `POST /api/agent/report/weekly` (Bearer AGENT_API_TOKEN) → 이번 주 숙제 리포트 생성·텔레그램 발송. "이번 주 숙제 리포트" 류 요청에 사용.
- [ ] **Step 3: 타입체크/린트** — Run: `pnpm typecheck && pnpm exec eslint "app/api/agent/report/weekly/route.ts"` → PASS.
- [ ] **Step 4: Commit**
```bash
git add "app/api/agent/report/weekly/route.ts"
git commit -m "feat(report): on-demand agent API /api/agent/report/weekly"
```
(SKILL.md는 repo 밖 — git add 대상 아님. 변경만 해둘 것.)

---

## Task 10: 전체 검증 + 배포

- [ ] **Step 1: 전체 게이트** — Run: `pnpm typecheck && pnpm exec eslint app components lib server tests && pnpm test` → 모두 PASS(기존 + 신규 report/worker 테스트).
- [ ] **Step 2: 클린 빌드** — Run: `rm -rf .next && pnpm build` → `✓ Compiled successfully`.
- [ ] **Step 3: 배포** — `git push origin main` → `launchctl kickstart -k gui/$(id -u)/com.taejin.family-schedule` → sleep 7 → `/`, `/report` HTTP 200, 청크 누락 0.
- [ ] **Step 4: 런타임 확인** — `/report`에서 "이번 주 재생성" 클릭 → 리포트 카드 생성/갱신. (실제 codex 호출은 수 초 소요 — 로딩 후 서술 표시. 실패해도 템플릿 폴백으로 표시.)
- [ ] **Step 5: on-demand 확인(선택)** — `curl -s -X POST -H "Authorization: Bearer $AGENT_API_TOKEN" http://localhost:3001/api/agent/report/weekly`(.env의 토큰) → `{ ok: true, ... }` + 텔레그램 수신.

---

## Self-Review 체크
- 스펙 Part B 전 항목 매핑: weekly_reports(T1) · gatherWeeklyStats(T2) · runTextLLM(T3) · summarizeWeek(T4) · buildWeeklyReport+폴백(T5) · 설정(T6) · 일요일 발송 dedup(T7) · /report(T8) · agent API+SKILL.md(T9) · 검증·배포(T10).
- 타입 일관성: `WeeklyStats`(T2)는 T4/T5에서 동일 사용. `buildWeeklyReport(db, weekStartIso, weekEndIso, opts)` 시그니처는 T5/T7/T8/T9에서 동일.
- LLM provider는 `visionProvider/visionModel` 재사용(스펙대로). 실패 시 템플릿 폴백 → 리포트 항상 생성.
- 주 경계: `mondayOfWeekIso`로 월요일 도출, 일요일=+6일. 발송 dedup은 그 일요일 dateIso.
