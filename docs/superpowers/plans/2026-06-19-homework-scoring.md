# Homework Scoring Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 부모가 완료된 숙제에 `상/중/하` + 선택 이유를 인라인 칩으로 기록하고, `/`에서 이번 주 미기록 완료 숙제를 모아 일괄 채점할 수 있게 한다.

**Architecture:** `homework_items`에 `score`/`score_reason` 두 컬럼 추가. 단일 서버 액션 `setHomeworkScore`로 설정/변경/해제. 재사용 클라이언트 컴포넌트 `ScoreChips`를 부모 화면 3곳(관리 `/` 완료행, 학원 상세 완료행, `/`의 "미기록" 섹션)에 배치. 아이홈(`/kids`)은 손대지 않는다.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + better-sqlite3, Tailwind v4, vitest. 마이그레이션은 `pnpm db:generate`(drizzle-kit) → `migrate()` 자동 적용.

**Phase 2(주간 리포트)는 별도 plan**: `docs/superpowers/plans/2026-06-19-homework-weekly-report.md` (Phase 1 배포 후 작성). 이 plan은 점수화만으로 동작·배포 가능.

**중요 운영 규칙(메모리):** 라이브 디렉토리(`~/apps/family-schedule`)에서 빌드한 뒤에는 반드시 `launchctl kickstart -k gui/$(id -u)/com.taejin.family-schedule`로 launchd 재시작(안 하면 청크 불일치로 라이브 깨짐).

---

## Task 1: 스키마 — `score` / `score_reason` 컬럼 추가

**Files:**
- Modify: `server/db/schema.ts` (homeworkItems 테이블)
- Create: `server/db/migrations/00NN_*.sql` (drizzle-kit 자동 생성)

- [ ] **Step 1: 컬럼 추가**

`server/db/schema.ts`의 `homeworkItems` 정의에서 `doneAt` 줄 바로 다음에 추가:

```ts
  doneAt: integer('done_at', { mode: 'timestamp' }),
  // 완료 후 부모가 매기는 품질 점수(선택). null = 미기록.
  score: text('score', { enum: ['상', '중', '하'] }),
  scoreReason: text('score_reason'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
```

- [ ] **Step 2: 마이그레이션 생성**

Run: `pnpm db:generate`
Expected: `server/db/migrations/`에 새 파일(예: `0019_*.sql`) 생성. 내용은 대략:
```sql
ALTER TABLE `homework_items` ADD `score` text;
ALTER TABLE `homework_items` ADD `score_reason` text;
```
(SQLite는 enum을 CHECK 없이 text로 저장 — TS 레벨에서만 enum.)

- [ ] **Step 3: 타입체크로 스키마 정합성 확인**

Run: `pnpm typecheck`
Expected: PASS (에러 없음).

- [ ] **Step 4: Commit**

```bash
git add server/db/schema.ts server/db/migrations
git commit -m "feat(score): homework_items에 score/score_reason 컬럼 추가"
```

---

## Task 2: `setHomeworkScore` 서버 액션 (TDD)

**Files:**
- Modify: `server/actions/homework.ts`
- Test: `tests/actions/homework-score.test.ts` (create)

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/actions/homework-score.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as appSchema from '@/server/db/schema'
import { setHomeworkScore, listCompletedThisWeekUnscored } from '@/server/actions/homework'

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-score-'))
  const sqlite = new Database(join(dir, 'app.db')); sqlite.pragma('foreign_keys = ON')
  const appDb = drizzle(sqlite, { schema: appSchema })
  migrate(appDb, { migrationsFolder: './server/db/migrations' })
  return appDb
}

function seedDoneItem(appDb: ReturnType<typeof makeDb>, doneAt: Date) {
  // academy → batch(academyId FK) → item 순서로 생성(FK 충족).
  const [academy] = appDb.insert(appSchema.academies).values({
    name: 'A', subject: 'math', color: '#000000',
  }).returning().all()
  const [batch] = appDb.insert(appSchema.homeworkBatches).values({
    academyId: academy.id, status: 'committed',
  }).returning().all()
  const [item] = appDb.insert(appSchema.homeworkItems).values({
    batchId: batch.id, academyId: academy.id, title: 'HW', source: 'manual',
    isCommitted: true, doneAt,
  }).returning().all()
  return item
}

describe('setHomeworkScore', () => {
  it('점수와 이유를 기록한다', async () => {
    const appDb = makeDb()
    const item = seedDoneItem(appDb, new Date())
    const res = await setHomeworkScore(item.id, '상', '깔끔하게 다 풀었음', { appDb })
    expect(res.ok).toBe(true)
    const row = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, item.id)).get()
    expect(row?.score).toBe('상')
    expect(row?.scoreReason).toBe('깔끔하게 다 풀었음')
  })

  it('score=null이면 이유도 비운다', async () => {
    const appDb = makeDb()
    const item = seedDoneItem(appDb, new Date())
    await setHomeworkScore(item.id, '중', '보통', { appDb })
    await setHomeworkScore(item.id, null, '남아있던 이유', { appDb })
    const row = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, item.id)).get()
    expect(row?.score).toBeNull()
    expect(row?.scoreReason).toBeNull()
  })

  it('잘못된 점수는 거부한다', async () => {
    const appDb = makeDb()
    const item = seedDoneItem(appDb, new Date())
    const res = await setHomeworkScore(item.id, 'A' as never, null, { appDb })
    expect(res.ok).toBe(false)
  })
})
```

> 주의: `seedDoneItem`은 batch FK 충족용으로 academy를 먼저 만들지만 batch.academyId가 academy.id와 달라도 테스트 목적엔 무방 — 단 schema FK 충족을 위해 batch insert 시 실제 academy.id를 쓰도록 아래 Step 3 구현 후 한 번 더 점검(만약 batch가 academyId FK를 강제하면 academy 먼저 만들고 batch.academyId=academy.id로).

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/actions/homework-score.test.ts`
Expected: FAIL — `setHomeworkScore`/`listCompletedThisWeekUnscored` is not exported.

- [ ] **Step 3: `setHomeworkScore` 구현**

`server/actions/homework.ts` 끝부분(다른 export 액션들 곁)에 추가. 파일 상단 import에 `gte, lt, isNull, desc, and, eq`가 이미 있는지 확인(있음). `localWeekWindow`는 `@/server/util/date`에서 import 추가:

```ts
// (파일 상단 기존 date import 줄에 localWeekWindow 추가)
import { localWeekWindow } from '@/server/util/date'

const SCORE_VALUES = ['상', '중', '하'] as const
export type HomeworkScore = (typeof SCORE_VALUES)[number]

export async function setHomeworkScore(
  id: number,
  score: HomeworkScore | null,
  reason: string | null,
  ctx: Ctx = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (score !== null && !SCORE_VALUES.includes(score)) {
    return { ok: false, error: '잘못된 점수' }
  }
  const appDb = ctx.appDb ?? getDb()
  const row = appDb.select({ academyId: appSchema.homeworkItems.academyId })
    .from(appSchema.homeworkItems)
    .where(eq(appSchema.homeworkItems.id, id))
    .get()
  const cleanReason = score === null ? null : (reason?.trim() || null)
  appDb.update(appSchema.homeworkItems)
    .set({ score, scoreReason: cleanReason })
    .where(eq(appSchema.homeworkItems.id, id))
    .run()
  revalidatePath('/')
  if (row) revalidatePath(`/academies/${row.academyId}`)
  return { ok: true }
}
```

> `localWeekWindow`는 Task 3에서 쓰므로 여기서 import만 추가해도 무방(미사용 경고 시 Task 3와 합쳐 커밋).

- [ ] **Step 4: 테스트(부분) 통과 확인**

Run: `pnpm exec vitest run tests/actions/homework-score.test.ts -t setHomeworkScore`
Expected: `setHomeworkScore` 3 케이스 PASS. (listCompletedThisWeekUnscored 케이스는 Task 3 후 통과.)

- [ ] **Step 5: Commit**

```bash
git add server/actions/homework.ts tests/actions/homework-score.test.ts
git commit -m "feat(score): setHomeworkScore 액션 + 테스트"
```

---

## Task 3: `listCompletedThisWeekUnscored` 조회 (TDD)

**Files:**
- Modify: `server/actions/homework.ts`
- Test: `tests/actions/homework-score.test.ts` (append)

- [ ] **Step 1: 실패 테스트 추가**

`tests/actions/homework-score.test.ts`에 describe 추가:

```ts
describe('listCompletedThisWeekUnscored', () => {
  it('이번 주 완료 & 점수 미기록만 반환한다', async () => {
    const appDb = makeDb()
    const inWeekUnscored = seedDoneItem(appDb, new Date())            // 이번 주, 미기록
    const inWeekScored = seedDoneItem(appDb, new Date())              // 이번 주, 채점됨
    await setHomeworkScore(inWeekScored.id, '상', null, { appDb })
    seedDoneItem(appDb, new Date('2000-01-03T10:00:00'))             // 옛날 완료 → 제외

    const rows = await listCompletedThisWeekUnscored({ appDb })
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(inWeekUnscored.id)
    expect(ids).not.toContain(inWeekScored.id)
    expect(rows.every((r) => r.id !== undefined && 'academyName' in r)).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/actions/homework-score.test.ts -t listCompletedThisWeekUnscored`
Expected: FAIL — not exported.

- [ ] **Step 3: 구현**

`server/actions/homework.ts`에 추가:

```ts
export async function listCompletedThisWeekUnscored(ctx: Ctx = {}) {
  const appDb = ctx.appDb ?? getDb()
  const { start, end } = localWeekWindow()
  return appDb.select({
    id: appSchema.homeworkItems.id,
    title: appSchema.homeworkItems.title,
    dueDate: appSchema.homeworkItems.dueDate,
    doneAt: appSchema.homeworkItems.doneAt,
    academyName: appSchema.academies.name,
    academyColor: appSchema.academies.color,
  })
  .from(appSchema.homeworkItems)
  .innerJoin(appSchema.academies, eq(appSchema.homeworkItems.academyId, appSchema.academies.id))
  .where(and(
    eq(appSchema.homeworkItems.isCommitted, true),
    isNull(appSchema.homeworkItems.score),
    gte(appSchema.homeworkItems.doneAt, start),
    lt(appSchema.homeworkItems.doneAt, end),
  ))
  .orderBy(desc(appSchema.homeworkItems.doneAt))
  .all()
}
```

- [ ] **Step 4: 전체 점수 테스트 통과 확인**

Run: `pnpm exec vitest run tests/actions/homework-score.test.ts`
Expected: 모든 케이스 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/actions/homework.ts tests/actions/homework-score.test.ts
git commit -m "feat(score): listCompletedThisWeekUnscored 조회 + 테스트"
```

---

## Task 4: 관리(`/`) 완료 조회에 score 노출

**Files:**
- Modify: `server/actions/homework.ts` (`listDoneToday`, `listDoneThisWeek` SELECT)

- [ ] **Step 1: SELECT에 score/scoreReason 추가**

`listDoneToday`와 `listDoneThisWeek`의 `.select({...})` 객체에 두 필드를 추가(두 함수 모두):

```ts
    doneAt: appSchema.homeworkItems.doneAt,
    score: appSchema.homeworkItems.score,
    scoreReason: appSchema.homeworkItems.scoreReason,
    academyName: appSchema.academies.name,
```
(기존 select에서 `doneAt` 또는 `academyName` 인접 위치에 끼워 넣음. 함수별로 select 모양이 다르면 각 함수의 select 객체에 `score`/`scoreReason` 두 줄만 추가.)

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/actions/homework.ts
git commit -m "feat(score): 관리 완료 목록 조회에 score 노출"
```

---

## Task 5: `ScoreChips` 클라이언트 컴포넌트

**Files:**
- Create: `app/_components/score-chips.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setHomeworkScore, type HomeworkScore } from '@/server/actions/homework'
import { cn } from '@/lib/utils'

const SCORES: HomeworkScore[] = ['상', '중', '하']

export function ScoreChips({
  id, score, reason,
}: {
  id: number
  score: HomeworkScore | null
  reason: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(reason ?? '')
  const [pending, setPending] = useState(false)

  async function pick(s: HomeworkScore) {
    const next = score === s ? null : s
    setPending(true)
    await setHomeworkScore(id, next, next === null ? null : (draft.trim() || null))
    setPending(false)
    router.refresh()
  }
  async function saveReason() {
    if (!score) return
    await setHomeworkScore(id, score, draft.trim() || null)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1">
      {SCORES.map((s) => (
        <button
          key={s}
          type="button"
          disabled={pending}
          onClick={() => pick(s)}
          aria-pressed={score === s}
          className={cn(
            'px-2 py-0.5 rounded-full text-xs border font-medium transition-colors',
            score === s
              ? 'bg-brand text-brand-foreground border-brand'
              : 'bg-muted text-muted-foreground border-foreground/10 hover:border-foreground/30',
          )}
        >
          {s}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
      >
        이유
      </button>
      {open && (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveReason}
          placeholder="이유(선택)"
          className="text-xs px-2 py-1 rounded border bg-background w-44"
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: 타입체크 + 린트**

Run: `pnpm typecheck && pnpm exec eslint app/_components/score-chips.tsx`
Expected: PASS, eslint exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/_components/score-chips.tsx
git commit -m "feat(score): ScoreChips 인라인 칩 컴포넌트"
```

---

## Task 6: 학원 상세 완료 행에 ScoreChips 연결

**Files:**
- Modify: `app/academies/[id]/_components/academy-items.tsx` (`Item` 타입 + `DoneRow`)

- [ ] **Step 1: `Item` 타입에 score 필드 추가**

`academy-items.tsx`의 `type Item = {...}`에 추가:

```ts
type Item = {
  id: number
  title: string
  notes: string | null
  dueDate: string | null
  doneAt: Date | null
  score: '상' | '중' | '하' | null
  scoreReason: string | null
}
```

> `getAcademyDetail`은 `select().from(homeworkItems)` 전체 컬럼이므로 `done` 항목에 score/scoreReason가 이미 포함됨(추가 쿼리 변경 불필요).

- [ ] **Step 2: import 추가**

```ts
import { ScoreChips } from '@/app/_components/score-chips'
```

- [ ] **Step 3: `DoneRow`의 비-select 경로에 ScoreChips를 행 버튼의 형제로 렌더**

⚠️ **버튼 중첩 금지**: `DoneRow`의 비-select 렌더는 행 전체가 `<button onClick={handleRestore}>`(탭=완료 취소)이고 그 안에 `{body}`가 들어간다. ScoreChips는 `<button>`(칩)이라 이 행 버튼 **안에 넣으면 button-in-button(무효 HTML) + 행 탭(복원)까지 발동**한다. 따라서 ScoreChips는 행 버튼 **바깥, 같은 행 셀 안의 형제**로 렌더한다.

`DoneRow`의 비-select 반환 fragment에서 `</ItemActionsMenu>` 직후(같은 `<>...</>` 안)에 추가:

```tsx
      </ItemActionsMenu>
      {/* 점수 칩 — 행 복원 버튼 바깥(형제)에 둬서 버튼 중첩/탭 충돌 방지 */}
      <div className="px-3 pb-2 -mt-1">
        <ScoreChips id={item.id} score={item.score} reason={item.scoreReason} />
      </div>
      <EditHomeworkDialog
```

select(다중선택) 모드 반환 경로에는 ScoreChips를 넣지 않는다(그 경로는 행 전체가 선택 토글 버튼).

- [ ] **Step 4: 빌드/타입체크**

Run: `pnpm typecheck && pnpm exec eslint "app/academies/[id]/_components/academy-items.tsx"`
Expected: PASS.

- [ ] **Step 5: 런타임 검증(로컬 prod 서버)**

```bash
rm -rf .next && pnpm build
(nohup ./node_modules/.bin/next start -p 3007 > /tmp/fs-v.log 2>&1 &) ; sleep 5
```
Playwright(browser_navigate `http://localhost:3007/academies/2`, browser_evaluate):
- 완료 섹션 행에 `상`/`중`/`하` 버튼이 보이는지(`document.querySelectorAll('button[aria-pressed]')` ≥ 3).
- 한 칩 클릭 → `aria-pressed=true` 전환 후 새로고침에도 유지.
- 라운드트립: 클릭으로 채점 후 같은 칩 다시 클릭(해제)해 데이터 원복.
종료: `pkill -f "next start -p 3007"`.

- [ ] **Step 6: Commit**

```bash
git add "app/academies/[id]/_components/academy-items.tsx"
git commit -m "feat(score): 학원 상세 완료 행에 점수 칩"
```

---

## Task 7: 관리(`/`) 완료 행에 ScoreChips 연결

**Files:**
- Modify: `app/_components/dashboard-item.tsx` (`HomeworkItemProps` + done variant 렌더)
- Modify: `app/page.tsx` (done 섹션에서 score/scoreReason를 HomeworkItem에 전달)

- [ ] **Step 1: `HomeworkItemProps`에 score 필드 추가**

`dashboard-item.tsx`의 `HomeworkItemProps`에:

```ts
  done?: boolean
  doneRelativeLabel?: string | null
  onUndo?: (formData: FormData) => Promise<void>
  score?: '상' | '중' | '하' | null
  scoreReason?: string | null
```

- [ ] **Step 2: import + done 본문에 ScoreChips**

`dashboard-item.tsx` 상단에 `import { ScoreChips } from './score-chips'`. 컴포넌트 시그니처에 `score`, `scoreReason` 구조분해 추가. `HomeworkItem`의 done variant는 행 전체가 `<button>`이 아니라 `<div>`(완료 체크만 별도 form/button)이므로 칩을 콘텐츠 div 안에 둬도 button 중첩은 아니다. 단 **다중선택 모드에선 행 div에 onClick 토글이 걸려 칩 클릭이 선택 토글로 새므로** `!isMultiActive`로 가드한다. `<div className="flex-1 min-w-0">` 안, 메타/notes 다음:

```tsx
        {notes && !done && (
          <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words line-clamp-2">
            {notes}
          </div>
        )}
        {done && !isMultiActive && (
          <ScoreChips id={id} score={score ?? null} reason={scoreReason ?? null} />
        )}
```

- [ ] **Step 3: `app/page.tsx`에서 score 전달**

`app/page.tsx`의 완료 항목 렌더(HomeworkItem `done` 사용처들)에서 매핑 객체에 `score={it.score}` `scoreReason={it.scoreReason}` 추가. (Task 4로 `listDoneToday`/`listDoneThisWeek` 결과에 이미 포함됨.)

- [ ] **Step 4: 타입체크/린트**

Run: `pnpm typecheck && pnpm exec eslint app/_components/dashboard-item.tsx app/page.tsx`
Expected: PASS.

- [ ] **Step 5: 런타임 검증** — 로컬 prod(`3007`)에서 `/`의 완료 섹션 행에 칩 표시·클릭·새로고침 유지 확인(Task 6 Step 5와 동일 방식, 라운드트립으로 원복).

- [ ] **Step 6: Commit**

```bash
git add app/_components/dashboard-item.tsx app/page.tsx
git commit -m "feat(score): 관리 완료 행에 점수 칩"
```

---

## Task 8: `/`에 "이번 주 점수 미기록 완료" 섹션

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: 조회 호출 추가**

`app/page.tsx` 상단 import에 `listCompletedThisWeekUnscored` 추가하고, 데이터 페치 부분(다른 `await`들 곁)에 추가:

```ts
const unscored = await listCompletedThisWeekUnscored()
```

- [ ] **Step 2: 섹션 렌더(접이식, 항목 있을 때만)**

완료 섹션들 근처에 추가. `ScoreChips` import 후:

```tsx
{unscored.length > 0 && (
  <details className="group rounded-xl ring-1 ring-foreground/10 bg-card overflow-hidden" open>
    <summary className="cursor-pointer select-none flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/40 transition-colors">
      <span>📝 점수 미기록 완료 (이번 주) · {unscored.length}</span>
      <span className="text-xs text-muted-foreground group-open:hidden">펼치기</span>
      <span className="text-xs text-muted-foreground hidden group-open:inline">접기</span>
    </summary>
    <div className="border-t divide-y">
      {unscored.map((it) => (
        <div key={it.id} className="p-3 flex items-start gap-3">
          <span className="w-[5px] h-9 rounded-full flex-shrink-0 mt-0.5" style={{ background: it.academyColor }} aria-hidden />
          <div className="flex-1 min-w-0">
            <div className="font-medium break-words line-through decoration-muted-foreground/40">{it.title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{it.academyName}</div>
            <ScoreChips id={it.id} score={null} reason={null} />
          </div>
        </div>
      ))}
    </div>
  </details>
)}
```

> `ScoreChips`가 점수를 매기면 `router.refresh()` → 서버 재조회 시 해당 항목이 `score IS NULL` 조건에서 빠져 목록에서 사라짐.

- [ ] **Step 3: 타입체크/린트**

Run: `pnpm typecheck && pnpm exec eslint app/page.tsx`
Expected: PASS.

- [ ] **Step 4: 런타임 검증** — `/`에서 섹션 표시, 칩으로 채점하면 항목이 목록에서 사라지는지 확인(로컬 3007).

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat(score): 홈에 이번 주 점수 미기록 완료 섹션"
```

---

## Task 9: 전체 검증 + 배포

- [ ] **Step 1: 전체 게이트**

Run: `pnpm typecheck && pnpm exec eslint app components lib server tests && pnpm test`
Expected: typecheck PASS, eslint exit 0, 전체 테스트 PASS(기존 293 + 신규 점수 케이스).

- [ ] **Step 2: 클린 빌드**

Run: `rm -rf .next && pnpm build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: 라이브 배포(빌드→재시작)**

```bash
git push origin main
launchctl kickstart -k gui/$(id -u)/com.taejin.family-schedule
sleep 7
curl -s -o /dev/null -w "/ %{http_code}\n" http://localhost:3001/
curl -s -o /dev/null -w "/academies/2 %{http_code}\n" http://localhost:3001/academies/2
```
Expected: 둘 다 `200`. 참조 청크 디스크 누락 0(이전 절차대로 확인).

- [ ] **Step 4: 라이브 동작 확인** — `/`·`/academies/2`에서 점수 칩 표시·클릭·유지, "미기록" 섹션 동작.

---

## Self-Review 체크(작성자용, 실행 전 확인)
- 스펙 §3 점수화 전 항목이 Task 1–9에 매핑됨(컬럼·액션·조회·칩·3개 surface·미기록 섹션·배포).
- `HomeworkScore` 타입은 Task 2에서 정의, Task 5/6/7에서 동일 사용(`'상'|'중'|'하'`).
- 아이홈(`/kids`)·`KidsDoneCard`는 손대지 않음(스펙 §3.2).
- Phase 2(리포트)는 별도 plan.
