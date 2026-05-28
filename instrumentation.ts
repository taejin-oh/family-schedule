// Next.js startup hook. Server (Node.js runtime) 시작 시 in-process worker를
// 백그라운드로 띄운다. AI 추출 job 처리 + Telegram digest + daily cleanup이
// 같은 Next.js 프로세스 안에서 돌아가므로 별도 `pnpm worker` 터미널 불필요.
//
// HMR/restart 시 register()가 다시 호출될 수 있으므로 globalThis flag로
// single-instance를 보장한다 (두 worker가 같은 DB를 동시에 polling/claim하면
// race condition 발생).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // Allow opt-out via env (e.g. CI, tests, or if someone wants to run
  // `pnpm worker` in a separate terminal instead).
  if (process.env.DISABLE_INPROC_WORKER === '1') {
    console.log('[instrumentation] in-process worker disabled via env')
    return
  }

  const g = globalThis as { __familyScheduleWorkerStarted?: boolean }
  if (g.__familyScheduleWorkerStarted) return
  g.__familyScheduleWorkerStarted = true

  console.log('[instrumentation] starting in-process worker')
  const { runWorker } = await import('@/server/worker/run')
  runWorker().catch((e) => {
    console.error('[instrumentation] worker crashed:', e)
    // Allow restart on next register() call (e.g. next HMR cycle).
    g.__familyScheduleWorkerStarted = false
  })
}
