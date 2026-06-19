# 설계: 숙제 점수화 + 주간 리포트

작성일: 2026-06-19 · 상태: 승인됨(구현 계획 대기)

## 1. 목표 / 배경

은채 숙제 추적 앱에 두 기능을 추가한다.

1. **점수화** — 숙제 완료 후 부모가 선택적으로 `상/중/하` 평가 + 선택 이유를 기록.
2. **주간 리포트** — 매주 일요일 저녁(기본 21:00, Asia/Seoul) 또는 on-demand로, 한 주 숙제 진행에 대한 리포트("뭐뭐 했고" + "얼마나 잘했고/뭐가 부족했고")를 생성·전달.

리포트의 정성 서술은 점수·이유 데이터를 입력으로 AI가 작성한다. AI는 **기존 codex/claude 서브프로세스($0, 구독 재사용)** 를 쓰며 새 유료 API는 도입하지 않는다.

## 2. 확정된 결정 (사용자 합의)

- **점수 주체/시점**: 아이홈(`/kids`)은 그대로 탭=완료(점수 UI 없음). **부모 화면(`/` 할 일, 학원 상세)** 에서만 완료 숙제에 `상/중/하` + 이유(선택) 기록. 완료된 숙제는 언제든 점수 조정·기입 가능.
- **점수 UI**: **인라인 칩**(행 안에 `상/중/하` 버튼 3개, 한 탭). 모달 아님.
- **미기록 모아보기**: `/`(부모 대시보드)에 "이번 주 점수 미기록 완료 숙제" 섹션(1주일치).
- **리포트 전달**: **둘 다** — 일요일 21:00 텔레그램 자동 푸시 + 앱 `/report` 페이지(언제든 보기·재생성) + on-demand(앱 버튼 / 텔레그램으로 비서에게 요청).
- **리포트 서술**: AI 요약(codex/claude 서브프로세스). 실패 시 결정적 템플릿 폴백.
- **리포트 LLM 설정**: 기존 `visionProvider`/`visionModel` 설정 **재사용**(별도 설정 안 만듦).

## 3. Part A — 점수화

### 3.1 데이터 모델
`homework_items`에 컬럼 2개 추가(기존 `done_at`처럼 additive 마이그레이션):
- `score text` — `'상' | '중' | '하' | null` (null = 미기록)
- `score_reason text` — 선택 자유 텍스트, null 허용

`score`가 null로 지워지면 `score_reason`도 함께 null로 정리한다.

### 3.2 동작 규칙
- 점수는 **완료(`done_at` ≠ null)** 숙제에만 의미가 있고, **부모 화면에서만** 노출/편집.
- 아이홈(`/kids`)에는 점수 UI를 추가하지 않는다(탭=완료 그대로).
- 완료 취소(복원) 시 `score`/`score_reason`은 **보존**(숨김). 재완료하면 그대로 유지. 비파괴적.

### 3.3 서버 액션
`setHomeworkScore(id, score, reason, ctx)` (server/actions/homework.ts)
- `score`: `'상'|'중'|'하'|null`로 검증. null이면 `score_reason`도 null.
- 업데이트 후 `revalidatePath('/')` + 해당 `revalidatePath('/academies/${academyId}')`.
- 반환: `{ ok: true } | { ok: false, error }`.

### 3.4 조회
`listCompletedThisWeekUnscored(ctx)` (server/actions/homework.ts)
- 이번 주(월~일, Asia/Seoul) 안에 `done_at`이 있고 `score IS NULL`인 committed 숙제.
- 반환 항목: id, title, academyName, academyColor, dueDate, doneAt.

### 3.5 UI — 인라인 칩
신규 클라이언트 컴포넌트 `ScoreChips`(app/_components/score-chips.tsx):
- `상 / 중 / 하` 버튼 3개. 현재 점수면 강조, 같은 칩 다시 탭 = 해제(null).
- "이유" 토글 → 작은 텍스트 입력(선택). blur 또는 디바운스 저장.
- `setHomeworkScore` 호출 + `router.refresh()`.

배치 위치(부모 화면만):
1. `/`(할 일)의 **완료 목록 행** (dashboard-item / 완료 섹션) — 부모가 `/`에서 탭-완료하면 그 행에 칩이 바로 보임 = "완료시 기록".
2. **학원 상세** 완료 섹션 (`academy-items.tsx` `DoneRow`).
3. **신규 섹션** `/`의 "이번 주 점수 미기록 완료 숙제"(접이식 카드) — `listCompletedThisWeekUnscored` 결과를 각 행 + `ScoreChips`로. 점수 매기면 목록에서 빠짐.

아이홈 완료 카드(`KidsDoneCard`)에는 `ScoreChips`를 넣지 않는다.

## 4. Part B — 주간 리포트

### 4.1 주(week) 정의
- 월요일~일요일 (Asia/Seoul local). 날짜가 속한 주의 월요일 = `weekStartIso`, 일요일 = `weekEndIso`.
- 일요일 21:00 자동 리포트 = 그 일요일로 끝나는 주(Mon~Sun).
- on-demand = 오늘이 속한 주(Mon~Sun) — 주중이면 week-to-date.

### 4.2 데이터 모델 — 신규 테이블 `weekly_reports` (앱 DB)
- `id` PK
- `week_start_iso text` **unique** (월요일, 'YYYY-MM-DD')
- `week_end_iso text` (일요일)
- `stats text` (json) — 집계 결과
- `narrative text` — AI 서술 (폴백 시 템플릿 문구)
- `model text` — 사용 모델(또는 'template')
- `generated_at integer` (timestamp)

unique(week_start_iso)라 주당 1개. 재생성은 upsert(덮어쓰기).

### 4.3 집계 — `gatherWeeklyStats(appDb, weekStartIso, weekEndIso)` (결정적)
완료 창: `done_at >= weekStart 00:00` AND `done_at < (weekEnd+1일) 00:00` (local).
반환:
- `completed[]`: { title, academyName, dueDate, doneAt, late(=완료일>마감일), score, scoreReason }
- `totalCompleted`, `lateCount`
- `scoreDist`: { '상': n, '중': n, '하': n, 미기록: n }
- `byAcademy`: { academyName: { completed, late, 상, 중, 하 } }
- `openAtWeekEnd`: 주말 시점 미완료(committed, done_at null, due_date ≤ weekEnd) 수

### 4.4 AI 서술 — `summarizeWeek(stats, opts)`
- `opts = { provider, model, run }` (run = 주입형 LLM 러너, 테스트용).
- 집계를 한국어 프롬프트로 구성 → `runTextLLM` 호출 → 2~4문장 정성 서술(잘한 점/부족한 점/패턴).
- 실패·타임아웃 시 `null` 반환(호출자가 템플릿 폴백).

`runTextLLM(prompt, { provider, model, timeoutMs })` (server/llm/text.ts, 신설)
- 이미지 없는 텍스트 전용 서브프로세스 호출.
- codex: `codex exec -m <model> --sandbox read-only --skip-git-repo-check -o <tmp>` + 프롬프트는 **stdin으로** 파이프(이미지 인자 `-i` 없음). 답은 `-o` 파일에서 읽음.
- claude: `claude -p` + 프롬프트 stdin.
- provider/model은 인자로 주입(기본은 호출부가 settings의 `visionProvider/visionModel`을 넘김).
- 러너 주입 가능 구조로 단위 테스트에서 실제 CLI 호출 없이 스텁.

### 4.5 조립 — `buildWeeklyReport(appDb, weekStartIso, { regenerate })`
1. `gatherWeeklyStats`.
2. `summarizeWeek` → 서술(없으면 결정적 템플릿).
3. 리포트 `text` 작성(텔레그램 HTML + 화면 공용): 헤더(기간) · 요약줄(완료 N · 지연 M) · 점수 분포 · 학원별 요약 · 서술 단락. 4096자 이내 유지(초과 시 안전 절단).
4. `weekly_reports` upsert(week_start_iso 기준).
5. 반환 `{ stats, narrative, text, model }`.

### 4.6 전달 경로
**(a) 텔레그램 자동(일요일 21:00)** — worker/run.ts에 `maybeFireWeekly` 추가.
- 일요일(Asia/Seoul) & `telegramWeeklyTime` 일치 & `telegramWeeklyEnabled`일 때 1회.
- dedup: 기존 `digest_log`에 `kind='weekly'` 추가, `date_iso = 그 일요일` → 주당 1회. (기존 morning/evening/midday와 동일한 race-safe nonce claim 패턴 재사용.)
- claim 성공 시 `buildWeeklyReport` → `sendTelegram(text)`. LLM 실패해도 템플릿으로 발송.

**(b) 앱 페이지 `/report`** — 서버 컴포넌트.
- 최신 리포트 + 이력(weekly_reports) 표시.
- "이번 주 리포트 생성/재생성" 버튼 → 서버 액션 `regenerateWeeklyReport()` → `buildWeeklyReport(현재 주, regenerate:true)`.
- `/`(할 일) 헤더에 `/report` 링크 추가.

**(c) on-demand 텔레그램** — 신규 `POST /api/agent/report/weekly` (`checkAgentAuth`).
- `buildWeeklyReport(현재 주, regenerate:true)` → `sendTelegram` → JSON 반환.
- 비서(lulu)에게 "이번 주 숙제 리포트 줘" → 이 엔드포인트 호출.
- **lulu `~/.openclaw/workspace/skills/family-schedule/SKILL.md`도 함께 업데이트**(메모리 규칙: agent API 변경 시 짝).

### 4.7 설정
`app_settings`에 추가:
- `telegram_weekly_enabled` (bool, 기본 true)
- `telegram_weekly_time` (text, 기본 '21:00') — 요일은 일요일 고정.

설정 화면(app/admin/settings)에 weekly 토글 + 시간 입력 추가(기존 morning/evening/midday UI와 동일 패턴). 일요일 21:00은 기본 evening digest와 시간이 겹칠 수 있으나 별개 메시지로 허용(필요시 시간 조정).

## 5. 마이그레이션 / 테스트 / 배포

### 5.1 마이그레이션
- app schema: `homework_items`(score, score_reason) / `weekly_reports` 생성 / `app_settings`(telegram_weekly_enabled, telegram_weekly_time). drizzle generate.
- jobs schema: `digest_log.kind` enum에 `'weekly'` 추가(TS 타입; DB는 text라 스키마 변경 없음).

### 5.2 테스트 (vitest)
- `gatherWeeklyStats`: 시드 데이터(완료/미완료/지연, 상중하/미기록)로 카운트·분포·지연·학원별 검증.
- `buildWeeklyReport`: `runTextLLM` 스텁 주입 → text 포맷·upsert 검증. LLM throw → 템플릿 폴백 검증.
- `setHomeworkScore`: 설정/변경/해제(이유 동반 정리) 검증.
- `listCompletedThisWeekUnscored`: 주 경계·score null 필터 검증.
- `maybeFireWeekly`: 일요일만/주당 1회 dedup(기존 digest fire 테스트 미러링).
- `runTextLLM`은 실제 CLI 미호출(주입형). 구조적 호출만 검증.

### 5.3 배포
빌드 후 **launchd 재시작**(디스크 `.next` 청크 일관성). 텔레그램은 기존 `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` 사용. 배포 후 `/`, `/report`, 점수 칩, on-demand 엔드포인트 동작 확인.

## 5.4 구현 단계 (phasing) — 각 단계 독립 배포·검증 가능
- **Phase 1 (점수화)**: schema(score 컬럼) + `setHomeworkScore`/`listCompletedThisWeekUnscored` + `ScoreChips` + 완료 행/학원 상세/미기록 섹션 연결 + 테스트. → 배포·검증.
- **Phase 2 (리포트 코어)**: `weekly_reports` + `gatherWeeklyStats` + `runTextLLM`/`summarizeWeek` + `buildWeeklyReport`(+템플릿 폴백) + 테스트.
- **Phase 3 (전달)**: `/report` 페이지+재생성, worker `maybeFireWeekly`+설정, `/api/agent/report/weekly` + lulu SKILL.md. → 배포·검증.

주 경계 계산은 기존 `server/util/date.ts`의 헬퍼(`mondayOfWeekIso`/`localWeekWindow`)를 재사용한다(중복 구현 금지).

## 6. 범위 밖 / 보류 (v1 제외)
- 매일/매주 할일(recurring) 점수화·리포트 포함 — v1은 **숙제만**. (추후 완료율 1줄 추가 가능)
- 숫자 점수/세분화 — `상/중/하` 3단계만.
- 리포트 전용 LLM 설정 — vision 설정 재사용(추후 분리 가능).
- 점수 기반 보상/스티커 연동 — 별도.

## 7. 영향 받는 주요 파일
- `server/db/schema.ts` (homework_items 컬럼, weekly_reports, app_settings)
- `server/jobs/schema.ts` (digest_log kind)
- `server/actions/homework.ts` (setHomeworkScore, listCompletedThisWeekUnscored)
- `server/actions/settings.ts` (weekly 설정)
- `server/notifications/weekly-report.ts` (신설: gatherWeeklyStats, summarizeWeek, buildWeeklyReport)
- `server/llm/text.ts` (신설: runTextLLM)
- `server/worker/run.ts` (maybeFireWeekly)
- `app/_components/score-chips.tsx` (신설), 완료 행/섹션 연결(`/`, academy-items)
- `app/page.tsx` (미기록 섹션 + /report 링크)
- `app/report/page.tsx` (신설) + 재생성 서버 액션
- `app/api/agent/report/weekly/route.ts` (신설)
- `app/admin/settings/*` (weekly 토글/시간)
- lulu `SKILL.md` (외부, 함께 업데이트)
