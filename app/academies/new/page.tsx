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
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1">
        <h1 className="text-[30px] leading-tight font-bold tracking-tight">새 학원</h1>
        <p className="text-sm text-muted-foreground mt-0.5">학원·과목·일정 추가</p>
      </header>
      <AcademyForm onSubmit={submit} submitLabel="추가" />
    </div>
  )
}
