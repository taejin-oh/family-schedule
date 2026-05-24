import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import {
  listArchivedAcademies,
  unarchiveAcademy,
  deleteAcademyPermanently,
} from '@/server/actions/academies'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { PermanentDeleteForm } from './delete-form'

const SUBJECT_KO: Record<string, string> = {
  math: '수학', english: '영어', korean: '국어', art: '미술',
  music: '음악', pe: '체육', science: '과학', other: '기타',
}

function formatArchivedAt(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export default async function ArchivedAcademiesPage() {
  const rows = await listArchivedAcademies()

  async function onRestore(formData: FormData) {
    'use server'
    const id = Number(formData.get('id'))
    await unarchiveAcademy(id)
    revalidatePath('/academies')
    revalidatePath('/academies/archived')
    revalidatePath('/')
  }

  async function onDeletePermanently(id: number, name: string) {
    'use server'
    await deleteAcademyPermanently(id)
    revalidatePath('/academies')
    revalidatePath('/academies/archived')
    revalidatePath('/')
    // The PermanentDeleteForm consumes a name arg only for the client confirm dialog;
    // the server action ignores it (still validates by id).
    void name
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">보관함</h1>
          <p className="text-sm text-muted-foreground mt-1">
            보관한 학원 · 복원하거나 영구 삭제 가능
          </p>
        </div>
        <Link href="/academies" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
          ← 학원 목록
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          보관된 학원이 없습니다.
        </Card>
      ) : (
        <Card className="divide-y p-0">
          {rows.map((r) => (
            <div key={r.id} className="p-4 flex items-center gap-3">
              <span className="w-4 h-4 rounded-full flex-shrink-0 opacity-50" style={{ background: r.color }} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-muted-foreground line-through">{r.name}</div>
                <div className="text-xs text-muted-foreground/70">
                  {SUBJECT_KO[r.subject] ?? r.subject}
                  {r.archivedAt && ` · ${formatArchivedAt(r.archivedAt)} 보관됨`}
                </div>
              </div>
              <form action={onRestore}>
                <input type="hidden" name="id" value={r.id} />
                <Button type="submit" variant="ghost" size="sm">복원</Button>
              </form>
              <PermanentDeleteForm
                id={r.id}
                name={r.name}
                action={onDeletePermanently}
              />
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
