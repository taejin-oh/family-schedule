import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { listAcademies } from '@/server/actions/academies'
import { listRecentBatches } from '@/server/actions/homework'
import { Card } from '@/components/ui/card'
import { BatchCard } from '../batch-card'

export default async function UploadHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ academy?: string }>
}) {
  const sp = await searchParams
  const academyId = sp.academy ? Number(sp.academy) : null
  if (academyId === null || Number.isNaN(academyId)) redirect('/homework/upload')

  const [academies, allBatches] = await Promise.all([
    listAcademies(),
    listRecentBatches({ limit: 500 }),
  ])
  const academy = academies.find((a) => a.id === academyId)
  if (!academy) notFound()

  const batches = allBatches.filter((b) => b.academyId === academyId)
  const archivedCount = batches.filter((b) => b.archivedAt !== null && b.photosCleanedAt === null).length
  const cleanedCount = batches.filter((b) => b.photosCleanedAt !== null).length

  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1">
        <Link
          href={`/homework/upload?academy=${academyId}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← 업로드로
        </Link>
        <h1 className="text-[30px] leading-tight font-bold tracking-tight mt-1">
          {academy.name} 업로드 이력
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          전체 {batches.length}개
          {archivedCount > 0 && ` · 보관 ${archivedCount}`}
          {cleanedCount > 0 && ` · 사진 정리됨 ${cleanedCount}`}
        </p>
      </header>

      {batches.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          업로드 이력이 없습니다.
        </Card>
      ) : (
        <div className="space-y-2">
          {batches.map((b) => (
            <BatchCard key={b.id} batch={b} />
          ))}
        </div>
      )}
    </div>
  )
}
