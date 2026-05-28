// Standalone worker entrypoint — `pnpm worker`로 별도 프로세스 실행할 때 사용.
// Next.js dev/prod에서는 `instrumentation.ts`가 in-process로 자동 시작하므로
// 보통 이 standalone 실행은 불필요. CI / 디버깅 / 특수 환경용으로만.
import { runWorker } from '@/server/worker/run'

runWorker().catch((e) => { console.error(e); process.exit(1) })
