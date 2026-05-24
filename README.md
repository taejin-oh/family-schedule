# family-schedule (Phase 0)

Daughter's 학원 schedule + AI-extracted homework todos. Single-machine,
localhost-only MVP. Repo: github.com/taejin-oh/family-schedule (private).

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

## Phase 0 scope
- Academies CRUD (`/academies`) — per-day schedule slots, color, optional AI
  extraction hint
- Upload photos or PDFs → AI extracts homework → review screen → commit
  (`/homework/upload` → `/homework/batches/<id>` → `/homework/batches/<id>/review`)
- Re-analyze past uploads with different hints/models; per-academy history
- Flat-todo dashboard (`/`) with due-date grouping, filter chips, and
  "오늘 한 일" completed section
- Provider/model selector (`/admin/settings`) — currently Claude only;
  Codex/Gemini providers are next-phase candidates

## Out of scope (Phase 0)
- Authentication, public/Tailscale exposure, Telegram digest, push,
  recurring schedules, multi-child, search, soft-delete

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
