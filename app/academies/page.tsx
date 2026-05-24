import Link from 'next/link'
import { listAcademies, archiveAcademy } from '@/server/actions/academies'
import { revalidatePath } from 'next/cache'

export default async function AcademiesPage() {
  const rows = await listAcademies()
  async function onArchive(formData: FormData) {
    'use server'
    const id = Number(formData.get('id'))
    await archiveAcademy(id)
    revalidatePath('/academies')
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">학원 목록</h1>
        <Link href="/academies/new" className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm">+ 새 학원</Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-gray-500">등록된 학원이 없습니다.</p>
      ) : (
        <ul className="divide-y bg-white rounded border">
          {rows.map((r) => (
            <li key={r.id} className="p-3 flex items-center gap-3">
              <span className="w-4 h-4 rounded-full" style={{ background: r.color }} />
              <div className="flex-1">
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-gray-500">{r.subject}{r.scheduleRule ? ` · ${r.scheduleRule.days.join(',')} ${r.scheduleRule.start}-${r.scheduleRule.end}` : ''}</div>
              </div>
              <Link href={`/academies/${r.id}/edit`} className="text-sm text-blue-600">편집</Link>
              <form action={onArchive}>
                <input type="hidden" name="id" value={r.id} />
                <button className="text-sm text-red-600">보관</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
