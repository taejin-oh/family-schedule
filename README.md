# family-schedule

Daughter's 학원 schedule + AI-extracted homework todos. Single-family app,
tailnet-accessible. Repo: github.com/taejin-oh/family-schedule (private).

## Prerequisites
- macOS, Node v22+, pnpm 10+
- `claude` CLI on PATH (Claude Code) with an active session — used as
  the default vision provider (`claude -p`, model `claude-opus-4-7`)

## First-time setup
```bash
pnpm install
pnpm db:generate
pnpm db:generate:jobs
```

## Run
```bash
./scripts/dev.sh
```
Opens at http://localhost:3001. This script runs:
- `next dev --turbopack -p 3001`  (web UI)
- `tsx watch worker.ts`            (background job worker — picks up
                                    extract_homework jobs from data/jobs.db)

Kill with Ctrl-C; both processes stop together.

## Tests
```bash
pnpm test          # one-shot
pnpm test:watch    # vitest UI
```

## Current scope
- Academies CRUD (`/academies`) + 보관함: soft-delete with restore + 영구 삭제
- Weekly timetable (`/timetable`) with per-academy weekly progress chips +
  per-slot daily completion badges; click slot → `/academies/[id]?date=…`
- Per-academy detail (`/academies/[id]`): item completion toggle, due-date
  pills, "+ 이 학원 숙제 추가" CTA, date filter from timetable drill-down
- Daily recurring tasks (`/recurring`) for non-academy todos
  (학교숙제 / 구몬 / 책읽기) — integrated into dashboard's "오늘" bucket
- Two-mode 숙제 추가 (`/homework/upload`): file upload (AI extraction) OR
  manual entry; per-academy hint, fuzzy duplicate warnings, inline re-extract
- Flat-todo dashboard (`/`) with due-date grouping, filter chips, multi-select
  bulk done / bulk delete, inline edit (title + due-date), re-click to undo
- Provider/model selector (`/admin/settings`)
- Pretendard variable font + PWA manifest
- Tailscale Serve at `https://selene-mac.tail033535.ts.net:8443`
  (tailnet-only, no public exposure)

## Telegram 다이제스트

하루 3회(아침·점심·저녁) 숙제 현황을 Telegram 그룹으로 발송합니다.

**봇 생성**
1. Telegram에서 `@BotFather` → `/newbot` → 이름 입력 → Token 복사

**가족 그룹에 봇 추가**
1. 그룹을 만들고 봇을 초대 (관리자 권한 불필요, 메시지 전송 권한만 있으면 됨)
2. 그룹에서 아무 메시지나 한 번 보냄
3. 브라우저에서 `https://api.telegram.org/bot<TOKEN>/getUpdates` 열면 `chat.id` 확인 가능 (그룹은 음수)

**설정**
```env
TELEGRAM_BOT_TOKEN=123456:ABCdef...
TELEGRAM_CHAT_ID=-1001234567890
```
`.env`에 두 값을 채운 뒤 worker 재시작. 이후 `/admin/settings` → 텔레그램 다이제스트 섹션에서 활성화.

## Out of scope (Phase 1.5+ candidates)
- Authentication
- Public exposure (Cloudflare Tunnel + Access)
- Push notifications (학원 1시간 전 native push 등 — Telegram digest는 이미 위에 구현됨)
- Multi-child support
- Search

## Where things live
- `app/`                — Next.js App Router pages + API routes
- `server/db/`          — Drizzle schema + better-sqlite3 client
- `server/jobs/`        — queue + runner (separate jobs.db)
- `server/llm/`         — Vision provider interface + ClaudeCliProvider
- `server/storage/`     — photo/file save + sharp resize
- `server/actions/`     — Server Actions (homework, academies, settings)
- `worker.ts`           — background job loop
- `data/`               — runtime SQLite + jobs queue (gitignored)
- `storage/photos/`     — runtime files (gitignored)
