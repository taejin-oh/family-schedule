#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

trap 'kill 0' EXIT
pnpm next dev --turbopack -p 3001 &
pnpm tsx watch worker.ts &
wait
