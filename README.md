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

## Out of scope (Phase 1.5+ candidates)
- Authentication
- Public exposure (Cloudflare Tunnel + Access)
- Notifications (Telegram digest, 10분 전 알림)
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
