// E2E: 실제 CodexProvider 코드 경로로 실이미지 1장 추출 검증.
// 실행: pnpm tsx scripts/e2e-codex.ts <imagePath>
import { CodexProvider } from '../server/llm/codex'

async function main() {
  const img = process.argv[2] ?? 'storage/photos/0000000039/000-orig.jpg'
  const provider = new CodexProvider()
  console.log(`[e2e] provider=codex model=${provider.defaultModel} fullRes=${provider.fullResolution}`)
  console.log(`[e2e] image=${img}`)
  const t0 = Date.now()
  const out = await provider.extractHomework({
    imagePaths: [img],
    academy: { name: '학교 알림장', subject: 'other', nextSessionAt: null },
    userHint: null,
  })
  const ms = Date.now() - t0
  console.log(`[e2e] done in ${(ms / 1000).toFixed(1)}s — items=${out.items.length} model=${out.modelUsed}`)

  const titles = out.items.map((i) => i.title)
  const blob = JSON.stringify(out.items)
  const checks: Array<[string, boolean]> = [
    ['"어휘교재 38쪽까지" 포함', blob.includes('어휘교재 38')],
    ['6/1 일기주제(친구/화해)', blob.includes('친구') || blob.includes('화해')],
    ['6/8 일기주제(귀신)', blob.includes('귀신')],
    ['Reading Gate', /reading gate/i.test(blob)],
    ['항목 ≥ 10개', out.items.length >= 10],
  ]
  console.log('\n[e2e] 검증:')
  let allPass = true
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? '✅' : '❌'} ${label}`)
    if (!ok) allPass = false
  }
  console.log('\n[e2e] 추출 항목 일부:')
  for (const t of titles.slice(0, 8)) console.log(`  · ${t}`)
  process.exit(allPass ? 0 : 1)
}

main().catch((e) => { console.error('[e2e] FAILED:', e); process.exit(1) })
