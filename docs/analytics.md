# Analytics / Usage Logging

가족 사용 패턴 / 실수 / 수정 추적용 이벤트 로깅 시스템. **외부 송신 0** — 로컬 sqlite의 `events` 테이블에만 INSERT. 향후 페이지·기능 최적화 결정에 사용.

## 핵심 원칙

- **Privacy**: `props_json`은 메타데이터만. 자녀가 입력한 실제 텍스트(숙제 제목 / 노트 등)는 저장하지 않음. ID, 변경된 필드 이름, 개수, 길이, 방향 같은 비식별 정보만.
- **외부 전송 0**: 모든 이벤트는 같은 sqlite 파일(`data/app.db`)의 `events` 테이블에 저장.
- **가족 멤버 구분 안 함**: `session_id`는 device/browser 단위(5년 cookie + localStorage). 누가 했는지는 추적 안 함.
- **실패 silent**: 로깅 자체가 user-facing 동작을 망가뜨리지 않음. 모든 helper가 내부 try/catch로 caller에 throw 안 함.
- **payload cap 8KB**: 초과 props는 row만 들어가고 `props_json` 자리는 null.

## Schema

`server/db/schema.ts`의 `events` 테이블:

| Column | Type | 설명 |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `ts` | INTEGER | unix ms timestamp |
| `local_date` | TEXT | `YYYY-MM-DD` (Seoul TZ, **분석 시 group by 즉시**) |
| `session_id` | TEXT? | client cookie/localStorage id (null 가능) |
| `category` | TEXT | `navigation` \| `interaction` \| `mutation` \| `error` \| `perf` \| `feature` |
| `event` | TEXT | 예: `page_enter`, `homework.create`, `swipe_nav` |
| `props_json` | TEXT? | 메타데이터 JSON 문자열 |
| `path` | TEXT? | 발생 시 pathname |
| `user_agent` | TEXT? | desktop/mobile 식별만 |

인덱스: `local_date`, `category`, `event`.

## 이벤트 추가 방법

### Server side — server actions / route handlers

```ts
import { logServerEvent } from '@/server/log/server-event'

export async function someMutation(input, ctx) {
  // ... 검증 + DB 작업 ...
  await logServerEvent({
    category: 'mutation',
    event: 'entity.verb',     // 예: 'homework.create', 'academy.archive'
    props: {
      id: row.id,
      fields: ['title', 'dueDate'],   // 변경된 필드 이름만
      // ❌ 실제 title 텍스트는 넣지 말 것
    },
  })
  return { ok: true, data: { id: row.id } }
}
```

- `cookies()`에서 `fs_session_id` 자동 주입.
- worker / job 같은 non-request 컨텍스트에선 sessionId null. 그래도 row는 들어감.
- validation 실패 분기에서도 `logServerEvent({ category: 'error', event: 'validation_fail', ... })` 한 줄 추가 권장 (사용자가 어떤 입력에서 막히는지 추적).

### Client side — React components

```ts
import { track } from '@/lib/log/client'

function Button() {
  return (
    <button onClick={() => track('interaction', 'button_click', { id: 'add-homework' })}>
      추가
    </button>
  )
}
```

- `sendBeacon` 우선 — page unload / navigation 도중에도 안전.
- `session_id` 첫 호출 시 자동 발급. cookie + localStorage 동시 set.
- 실패 silent.

## 카테고리 가이드

| Category | 언제 | 현재 잡히는 이벤트 (예) |
|---|---|---|
| **navigation** | 페이지 진입/이탈 | `page_enter`, `page_leave`(+`dwell_ms`) — `components/analytics-tracker.tsx`가 자동 |
| **interaction** | UI 인터랙션 (click/swipe/longpress) | `swipe_nav`, `longpress_menu_open`, `edit_open` |
| **mutation** | 데이터 변경 (CRUD) | `homework.create/update/done/...`, `academy.archive`, `recurring.done`, `sticker.redeem`, `settings.update`, ... |
| **error** | 오류 발생 | `uncaught` (`app/error.tsx`), `global_uncaught`, `validation_fail` |
| **perf** | 성능 측정 | `createEmptyBatch`, `review.fetch`, `startManual` |
| **feature** | 기능 사용 분기 / 노출 | `upload_mode_chosen` (file/manual), `empty_state.seen`, `telegram.test_sent` |

자동 계측 위치:
- `components/analytics-tracker.tsx` — root layout. 모든 페이지 navigation.
- `app/error.tsx` + `app/global-error.tsx` — uncaught client errors.
- `server/actions/*.ts` — 모든 mutation server action에 `logServerEvent` 호출.

## 분석 SQL 예시

```sql
-- 날짜별 이벤트 양
SELECT local_date, count(*) FROM events GROUP BY local_date ORDER BY local_date DESC LIMIT 30;

-- 카테고리 분포
SELECT category, count(*) FROM events GROUP BY category;

-- 가장 많이 한 mutation
SELECT event, count(*) FROM events
WHERE category='mutation'
GROUP BY event ORDER BY count(*) DESC LIMIT 20;

-- "실수 → 수정" 후보: 항목 생성 5분 안에 삭제
SELECT * FROM events
WHERE event='homework.draft_delete' AND json_extract(props_json,'$.ageMs') < 300000;

-- "마음 바꿈" 후보: 완료 직후 undo (간단 휴리스틱; 같은 itemId 페어링은 LAG/세션 필요)
SELECT count(*) AS undo_count FROM events WHERE event='homework.undone';

-- 페이지 평균 머문 시간
SELECT json_extract(props_json,'$.path') AS path,
       avg(json_extract(props_json,'$.dwell_ms')) AS avg_dwell_ms,
       count(*) AS visits
FROM events WHERE event='page_leave'
GROUP BY path ORDER BY avg_dwell_ms DESC;

-- swipe 방향 분포 + chained 비율
SELECT json_extract(props_json,'$.direction') AS dir,
       json_extract(props_json,'$.chained')   AS chained,
       count(*) AS n
FROM events WHERE event='swipe_nav' GROUP BY dir, chained;

-- 업로드 mode 선호도 (수동 vs 파일)
SELECT json_extract(props_json,'$.mode') AS mode, count(*) AS n
FROM events WHERE event='upload_mode_chosen' GROUP BY mode;

-- empty state 노출 빈도
SELECT json_extract(props_json,'$.where') AS where_, count(DISTINCT local_date) AS days, count(*) AS n
FROM events WHERE event='empty_state.seen' GROUP BY where_;

-- perf 지표 분포 (해당 사용자가 느낀 latency)
SELECT event,
       avg(json_extract(props_json,'$.ms')) AS avg_ms,
       max(json_extract(props_json,'$.ms')) AS max_ms,
       count(*) AS n
FROM events WHERE category='perf' GROUP BY event;

-- 특정 날짜 활동 요약
SELECT category, event, count(*) AS n
FROM events WHERE local_date='2026-05-28'
GROUP BY category, event ORDER BY n DESC;
```

CLI 실행 예:
```bash
sqlite3 data/app.db "SELECT category, event, count(*) FROM events GROUP BY category, event ORDER BY count(*) DESC LIMIT 20;"
```

## 테스트 패턴

새 이벤트 추가 시:
- 기존 server action 테스트들은 자동으로 events 테이블에 row를 추가하지만 read 안 함 → 영향 없음.
- 새 helper / API endpoint 추가 시 `tests/log/event.test.ts`, `tests/api/log.test.ts` 패턴 참조.
- `vi.hoisted`로 logEvent를 mock하는 패턴이 필요할 수 있음 (top-level 변수가 hoist 시점에 not initialized라).

## 변경 시 주의

| 변경 | 어느 곳을 같이 수정 |
|---|---|
| 새 카테고리 추가 | `server/log/events.ts`의 `ALLOWED_CATEGORIES` + `app/api/log/route.ts`의 `ALLOWED` 둘 다 |
| schema 컬럼 변경 | `pnpm drizzle-kit generate` 후 새 migration 파일 review + commit |
| session_id cookie 이름 변경 | `lib/log/client.ts`의 `COOKIE_NAME` + `server/log/server-event.ts`의 `cookies().get(...)` 둘 다 |
| props_json cap 변경 | `server/log/events.ts`의 `PROPS_CAP_BYTES` |
| body size cap 변경 | `app/api/log/route.ts`의 `MAX_BODY_BYTES` |

## 보존 + 분석 단위

- **보존: 1년 (365일).** 매일 04:00 Seoul daily tick (`server/worker/run.ts`)에서 `runEventsCleanup`이 자동 실행 — `local_date < today - 365days` row를 삭제.
- **분석 단위: 1개월.** `local_date`의 앞 7자(`YYYY-MM`)로 group by → 최근 12개 버킷.

상수 변경: `server/util/events-cleanup.ts`의 `EVENTS_RETENTION_DAYS`.

월별 분석 SQL 예시:
```sql
-- 월별 이벤트 양
SELECT substr(local_date, 1, 7) AS month, count(*) AS n
FROM events
GROUP BY month ORDER BY month DESC;

-- 월별 mutation 분포
SELECT substr(local_date, 1, 7) AS month, event, count(*) AS n
FROM events WHERE category='mutation'
GROUP BY month, event ORDER BY month DESC, n DESC;

-- 월별 평균 perf
SELECT substr(local_date, 1, 7) AS month, event,
       avg(json_extract(props_json,'$.ms')) AS avg_ms
FROM events WHERE category='perf'
GROUP BY month, event ORDER BY month DESC;
```

수동 정리(긴급 시):
```sql
DELETE FROM events WHERE local_date < date('now', '-365 days');
VACUUM;
```

## 파일 위치 요약

- `server/db/schema.ts` — events 테이블 정의
- `server/db/migrations/0014_cool_lifeguard.sql` — 초기 마이그레이션
- `server/log/events.ts` — `logEvent` (server-only)
- `server/log/server-event.ts` — `logServerEvent` (cookies 자동 주입)
- `app/api/log/route.ts` — POST endpoint (client → server 수신)
- `lib/log/client.ts` — `track` + `getSessionId`
- `components/analytics-tracker.tsx` — root layout navigation 자동 추적
- `components/empty-state-tracker.tsx` — empty state 노출 client wrapper
- `app/error.tsx` + `app/global-error.tsx` — uncaught error 자동
- `server/util/events-cleanup.ts` — `runEventsCleanup` (30일 retention)
- `server/worker/run.ts` — 04:00 daily tick에 cleanup 연결
- `tests/log/event.test.ts`, `tests/log/events-cleanup.test.ts`, `tests/api/log.test.ts` — 단위 테스트 패턴
- `tests/__mocks__/next-headers.ts` — vitest용 cookies stub
