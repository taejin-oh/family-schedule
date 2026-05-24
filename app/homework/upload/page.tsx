import { listAcademies } from '@/server/actions/academies'
import { UploadForm } from './upload-form'

export default async function UploadPage() {
  const rows = await listAcademies()
  const academies = rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    extractionHint: r.extractionHint,
  }))
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">숙제 파일 업로드</h1>
      <UploadForm academies={academies} />
    </div>
  )
}
