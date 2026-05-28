import { notFound } from 'next/navigation'
import { listAcademies } from '@/server/actions/academies'
import { listRecentBatches, listRelatedBatches } from '@/server/actions/homework'
import { eq } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { UploadForm } from './upload-form'

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ reuse?: string; academy?: string; mode?: string }>
}) {
  const sp = await searchParams
  const reuseId = sp.reuse ? Number(sp.reuse) : null
  const preselectedAcademyId = sp.academy ? Number(sp.academy) : null
  const mode = sp.mode === 'file' ? 'file' : null

  const [academyRows, batches] = await Promise.all([
    listAcademies(),
    // 학원별 최근 3개만 보여주는 UI라 30개는 과도한 transfer. 10개로 충분.
    listRecentBatches({ limit: 10 }),
  ])

  const academies = academyRows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    extractionHint: r.extractionHint,
  }))

  // Group batches per academy (newest first via listRecentBatches ordering)
  const batchesByAcademy: Record<number, typeof batches> = {}
  for (const b of batches) {
    ;(batchesByAcademy[b.academyId] ??= []).push(b)
  }

  // Distinct non-null hints per academy (newest first, deduped).
  // 'committed' batch의 hint만 — 사용자가 리뷰까지 마쳐서 실제 등록(=억셉트)한 것.
  // ready/failed/pending 상태의 hint는 검증 안 된 것이라 재사용 후보로 부적합.
  const hintsByAcademy: Record<number, string[]> = {}
  for (const b of batches) {
    if (b.status !== 'committed') continue
    const h = b.userHint?.trim()
    if (!h) continue
    const list = (hintsByAcademy[b.academyId] ??= [])
    if (!list.includes(h)) list.push(h)
  }

  // If reuse mode, fetch the source batch + its analysis history
  let reuse: { batchId: number; academyId: number; photos: { path: string; isPdf: boolean }[]; userHint: string | null; capturedAt: Date } | null = null
  let related: Awaited<ReturnType<typeof listRelatedBatches>> = []
  if (reuseId !== null) {
    const batch = getDb().select().from(schema.homeworkBatches).where(eq(schema.homeworkBatches.id, reuseId)).get()
    if (!batch) notFound()
    const photos = getDb().select().from(schema.homeworkPhotos).where(eq(schema.homeworkPhotos.batchId, reuseId)).all()
    reuse = {
      batchId: batch.id,
      academyId: batch.academyId,
      capturedAt: batch.capturedAt,
      userHint: batch.userHint,
      photos: photos.map((p) => ({ path: p.resizedPath, isPdf: p.resizedPath.toLowerCase().endsWith('.pdf') })),
    }
    related = await listRelatedBatches(reuseId)
  }

  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1">
        <h1 className="text-[30px] leading-tight font-bold tracking-tight">
          {reuse ? '재분석' : '숙제 추가'}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {reuse ? '같은 파일로 다시 분석' : '사진 또는 직접 입력'}
        </p>
      </header>
      <UploadForm
        academies={academies}
        batchesByAcademy={batchesByAcademy}
        hintsByAcademy={hintsByAcademy}
        reuse={reuse}
        related={related}
        initialAcademyId={preselectedAcademyId}
        mode={mode}
      />
    </div>
  )
}
