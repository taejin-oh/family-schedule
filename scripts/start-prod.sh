#!/bin/bash
# launchd가 호출하는 production 시작 wrapper.
# - 작업 디렉토리 명시
# - nvm 환경(node + pnpm)을 PATH에 명시적으로 추가 (launchd는 interactive shell 환경 안 받음)
# - exec로 같은 PID 유지 (launchd KeepAlive가 정확히 트래킹)
set -euo pipefail

NODE_BIN="/Users/taejin/.nvm/versions/node/v22.22.2/bin"
export PATH="${NODE_BIN}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

cd /Users/taejin/apps/family-schedule
exec "${NODE_BIN}/pnpm" start
