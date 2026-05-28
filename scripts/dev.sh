#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# instrumentation.ts가 `next dev` 안에서 in-process worker를 자동 기동하므로,
# 별도 `tsx watch worker.ts`까지 띄우려면 in-process 쪽을 꺼야 jobs.db에
# 두 워커가 동시 polling하지 않는다 (race → 같은 LLM job 중복 실행).
export DISABLE_INPROC_WORKER=1

trap 'kill 0' EXIT
pnpm next dev --turbopack -p 3001 &
pnpm tsx watch worker.ts &
wait
