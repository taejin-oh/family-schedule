import { eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { ReviewForm } from './review-form'

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const batchId = Number(id)
  const batch = getDb().select().from(schema.homeworkBatches).where(eq(schema.homeworkBatches.id, batchId)).get()
  if (!batch) notFound()
  if (batch.status === 'pending' || batch.status === 'processing') redirect(`/homework/batches/${batchId}`)

  const items = getDb().select().from(schema.homeworkItems).where(eq(schema.homeworkItems.batchId, batchId)).all()
  const photos = getDb().select().from(schema.homeworkPhotos).where(eq(schema.homeworkPhotos.batchId, batchId)).all()
  const academy = getDb().select().from(schema.academies).where(eq(schema.academies.id, batch.academyId)).get()

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">추출 결과 검토</h1>
        {academy && (
          <span className="text-sm text-muted-foreground flex items-center gap-2">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: academy.color }} />
            {academy.name}
          </span>
        )}
      </div>
      <ReviewForm
        batchId={batchId}
        initial={items.map((it) => ({ id: it.id, title: it.title, dueDate: it.dueDate, source: it.source }))}
        photos={photos.map((p) => ({ path: p.resizedPath, isPdf: p.resizedPath.toLowerCase().endsWith('.pdf') }))}
      />
    </div>
  )
}
