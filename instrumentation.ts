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

  const g = globalThis as { __familyScheduleWorkerStarted?: boolean; __familyScheduleSignalsBound?: boolean }
  if (g.__familyScheduleWorkerStarted) return
  g.__familyScheduleWorkerStarted = true

  // launchctl kickstart -k가 SIGTERM 보낼 때 process가 즉시 종료되도록.
  // worker의 무한 polling loop + Next.js HTTP server가 default로 signal을 잡아
  // graceful shutdown을 시도하지만 worker는 자체적으로 빠져나갈 길이 없어 orphan
  // process가 누적되고, 누적된 worker들이 각자 alert/digest를 쏘는 사례 발생.
  // (한 번만 등록해서 HMR 사이클에서 중복 등록 방지.)
  if (!g.__familyScheduleSignalsBound) {
    g.__familyScheduleSignalsBound = true
    for (const sig of ['SIGTERM', 'SIGINT'] as const) {
      process.once(sig, () => {
        console.log(`[instrumentation] ${sig} received, exiting`)
        process.exit(0)
      })
    }
  }

  console.log('[instrumentation] starting in-process worker')
  const { runWorker } = await import('@/server/worker/run')
  runWorker().catch((e) => {
    console.error('[instrumentation] worker crashed:', e)
    // Allow restart on next register() call (e.g. next HMR cycle).
    g.__familyScheduleWorkerStarted = false
  })
}
