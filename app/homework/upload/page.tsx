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
  searchParams: Promise<{ reuse?: string; academy?: string }>
}) {
  const sp = await searchParams
  const reuseId = sp.reuse ? Number(sp.reuse) : null
  const preselectedAcademyId = sp.academy ? Number(sp.academy) : null

  const [academyRows, batches] = await Promise.all([
    listAcademies(),
    listRecentBatches({ limit: 30 }),
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

  // Distinct non-null hints per academy (newest first, deduped)
  const hintsByAcademy: Record<number, string[]> = {}
  for (const b of batches) {
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
      <h1 className="text-2xl font-semibold tracking-tight">
        {reuse ? '재분석' : '숙제 추가'}
      </h1>
      <UploadForm
        academies={academies}
        batchesByAcademy={batchesByAcademy}
        hintsByAcademy={hintsByAcademy}
        reuse={reuse}
        related={related}
        initialAcademyId={preselectedAcademyId}
      />
    </div>
  )
}
