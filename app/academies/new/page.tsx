import { redirect } from 'next/navigation'
import { createAcademy } from '@/server/actions/academies'
import type { AcademyInput } from '@/server/actions/academies'
import { AcademyForm } from '../_components/academy-form'

export default function NewAcademyPage() {
  async function submit(input: AcademyInput) {
    'use server'
    const res = await createAcademy(input)
    if (res.ok) redirect('/academies')
    return res
  }
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">새 학원</h1>
      <AcademyForm onSubmit={submit} submitLabel="추가" />
    </div>
  )
}
