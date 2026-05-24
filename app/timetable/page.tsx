import { listAcademies } from '@/server/actions/academies'
import { Timetable } from './timetable'

export default async function TimetablePage() {
  const academies = await listAcademies()
  return <Timetable academies={academies} />
}
