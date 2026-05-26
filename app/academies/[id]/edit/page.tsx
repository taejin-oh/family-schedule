import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { updateAcademy } from '@/server/actions/academies'
import type { AcademyInput } from '@/server/actions/academies'
import { AcademyForm } from '../../_components/academy-form'

export default async function EditAcademyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = Number(id)
  const row = getDb().select().from(schema.academies).where(eq(schema.academies.id, numId)).get()
  if (!row) notFound()
  async function submit(input: AcademyInput) {
    'use server'
    const res = await updateAcademy(numId, input)
    if (res.ok) redirect('/academies')
    return res
  }
  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1">
        <h1 className="text-[30px] leading-tight font-bold tracking-tight">{row.name} 편집</h1>
        <p className="text-sm text-muted-foreground mt-0.5">학원·과목·일정 수정</p>
      </header>
      <AcademyForm
        initial={{
          name: row.name, subject: row.subject as AcademyInput['subject'], color: row.color,
          scheduleRule: row.scheduleRule, location: row.location, notes: row.notes,
          extractionHint: row.extractionHint,
        }}
        onSubmit={submit}
        submitLabel="저장"
      />
    </div>
  )
}
