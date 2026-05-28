# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

Package manager is **pnpm** (workspace), Node v22+. Dev server runs on port **3001**.

```bash
pnpm dev                # canonical dev — `next dev --turbopack -p 3001`; instrumentation.ts auto-starts the in-process worker
./scripts/dev.sh        # alt — sets DISABLE_INPROC_WORKER=1 and runs `next dev` + `tsx watch worker.ts` (worker hot-reload on file edits)
pnpm worker             # standalone worker (CI/debug; not needed in dev)
pnpm build && pnpm start

pnpm test               # vitest run (one-shot)
pnpm test:watch         # vitest watch mode (terminal); add `--ui` for the browser dashboard
pnpm vitest run path/to/file.test.ts -t "test name"   # single test

pnpm typecheck          # tsc --noEmit (used for verification — there's no test for type errors)
pnpm lint               # eslint

pnpm db:generate        # drizzle-kit generate for data/app.db (schema in server/db/schema.ts)
pnpm db:generate:jobs   # same for data/jobs.db (schema in server/jobs/schema.ts)
pnpm db:migrate         # tsx scripts/migrate.ts — opens app.db only; jobs.db migrates lazily on worker startup
```

Quick analytics check: `sqlite3 data/app.db "SELECT category, event, count(*) FROM events GROUP BY 1,2 ORDER BY 3 DESC LIMIT 20;"` (see `docs/analytics.md`).

## Architecture

**Stack:** Next.js 16 (App Router, Turbopack, Server Actions) + React 19 + Tailwind v4 + shadcn-ui + Drizzle ORM + better-sqlite3 + Zod. Korean UI, Asia/Seoul TZ canonical.

### Two SQLite databases (separated to avoid lock contention)

- `data/app.db` — domain data. Schema: `server/db/schema.ts`. Client: `server/db/client.ts` (singleton via `getDb()`, WAL mode, FK on, auto-migrates on first call, seeds `appSettings` row id=1).
- `data/jobs.db` — job queue + digest dedupe log. Schema: `server/jobs/schema.ts`. Client opened separately inside the worker.

Both DBs migrate themselves on open; `pnpm db:migrate` is for manual control. Migrations are tracked in `server/{db,jobs}/migrations/`.

### Background worker — in-process by default

`instrumentation.ts` (Next.js startup hook for `nodejs` runtime) calls `runWorker()` from `server/worker/run.ts` once per process, guarded by a `globalThis` flag so HMR doesn't double-start. Opt out with `DISABLE_INPROC_WORKER=1`.

The worker has **one polling loop (1s)** doing all of:
1. `extract_homework` jobs — claim from `jobs.db`, run `processExtractHomework` (`server/jobs/runner.ts`) which calls the configured VisionProvider and dedupes against existing committed items.
2. Telegram digests (`morning`/`evening` — `midday` is legacy schema only, intentionally not fired; see comment in `run.ts`) — race-safe claim via `INSERT ... ON CONFLICT DO NOTHING` into `digest_log` (unique on `kind+date_iso`), so re-entry can't double-send.
3. Academy ±N min reminders — once per slot per day, tracked in-memory.
4. Daily cleanup at `04:00` Asia/Seoul (`runBatchCleanup` + `runEventsCleanup`).
5. Reaping stale `running` jobs older than 10min on startup + every 60 polls.

**Critical:** running two workers against the same `jobs.db` will cause double-extraction races. The atomic claim in `claimNext` only protects the SQL update, not the side-effecting LLM call. The single-instance guard is the load-bearing safety mechanism.

### LLM extraction

`server/llm/` defines a `VisionProvider` interface (`types.ts`) with a registry (`registry.ts`). Only `ClaudeCliProvider` exists today — it shells out to the local `claude -p` CLI (Claude Code session must be active). Provider + model are read per-job from `appSettings`. Prompt construction in `server/llm/prompt.ts`. Output is a `DraftItem[]` with optional `confidence` + `confidenceReason`. Two distinct thresholds: the AI is asked to write `confidenceReason` when `confidence < 0.7` (`prompt.ts`), but the review UI only surfaces the "확신 낮음" badge when `confidence < 0.6` (`app/homework/batches/[id]/review/review-form.tsx`).

### Server Actions vs API routes

- `server/actions/*.ts` — Server Actions, mostly marked with the `'use server'` directive (one exception: `academies.ts` uses `import 'server-only'` and exports plain server-side functions called from RSC code). Use Zod for input validation, return `{ ok: true } | { ok: false; error }`. Most actions call `revalidatePath(...)` for the pages they affect.
- `app/api/log/route.ts`, `app/api/photo/route.ts` — internal client→server endpoints.
- `app/api/agent/**` — external read/write API for other agents (e.g. OpenClaw). All routes call `checkAgentAuth(req)` first; auth is a shared bearer token in `AGENT_API_TOKEN`. Missing env var → 503 (safe default). User browser traffic never goes through `/api/agent`.

### Domain shape

- **Academy** (`academies`) — has subject, color, optional `scheduleRule` (`{ slots: [{ day, start: 'HH:MM', end: 'HH:MM' }] }` stored as JSON), `extractionHint` (persistent AI hint), soft-deleted via `archivedAt`.
- **Homework batch** (`homeworkBatches`) — one upload (or manual entry). Lifecycle: `pending → processing → ready → committed` (or `failed`). After all items done + 7d, `archivedAt` set; after 90d more, photos physically deleted (`photosCleanedAt`). FK cascade on batch deletion takes out both `homeworkPhotos` *and* `homeworkItems` (both have `onDelete: 'cascade'` on `batchId`); the "items survive with `sourcePhotoId` nulled" behavior is the *photo*-cleanup path where the batch row is retained and only photo rows are deleted (photo→item FK is `set null`).
- **Homework item** (`homeworkItems`) — `source: 'ai'|'manual'`, `dueDate` as 'YYYY-MM-DD' string, `doneAt` timestamp. Dedup happens during AI extraction in `server/jobs/runner.ts`: draft items are filtered against existing committed items in the same academy (key = normalized title + dueDate). `commitBatch` and `addManualItem` do not dedup.
- **Recurring tasks** (`recurringTasks` + `recurringTaskCompletions`) — daily/weekly todos (학교숙제 / 구몬 / 책읽기). Completions keyed by `(taskId, completionDate)` unique.
- **Reward system** (`rewardSettings` / `stamps` / `redemptions`) — active reward is the newest `archivedAt IS NULL` row; stamps unique by `forDate`; redemptions snapshot reward info at time of payout.
- **Events** (`events`) — local-only analytics, no external send, no child input text. `localDate` precomputed in Seoul TZ. See `docs/analytics.md`.

### Conventions you can't infer from code

- **Time is stored as strings**: `'HH:MM'` for time-of-day, `'YYYY-MM-DD'` for dates — both interpreted in `Asia/Seoul`. Don't introduce Date objects for these fields.
- **Path alias `@/*`** maps to repo root (not `src/`). Tests use the same alias plus mocks for `server-only`, `next/cache`, `next/headers` (`vitest.config.ts`).
- **Soft-delete by `archivedAt`** is the standard pattern; queries filter `isNull(archivedAt)` for active rows.
- **Korean** is the default language for UI strings, comments, and commit messages. Match the surrounding style.
- **`devIndicators: false`** in `next.config.ts` is intentional — it overlapped the bottom nav on mobile.
- **Tailnet-only deploy** at `https://selene-mac.tail033535.ts.net:8443`. No public exposure, no auth layer. Production starts via `launchd` → `scripts/start-prod.sh`.

## Tests

Vitest, node environment, fork pool. Tests live in `tests/` mirroring source layout (`tests/actions/`, `tests/api/`, `tests/db/`, `tests/jobs/`, `tests/llm/`, `tests/notifications/`, etc.). `tests/__mocks__/` provides the server-only / next-* stubs needed to import server code from node tests. Real SQLite is used (file path overridable via `APP_DB_PATH` / `JOBS_DB_PATH`) — no DB mocking.
