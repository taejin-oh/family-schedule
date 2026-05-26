import type { AcademyInput } from '@/server/actions/academies'

export const SUBJECTS: { value: AcademyInput['subject']; label: string }[] = [
  { value: 'math', label: '수학' },
  { value: 'english', label: '영어' },
  { value: 'korean', label: '국어' },
  { value: 'art', label: '미술' },
  { value: 'music', label: '음악' },
  { value: 'pe', label: '체육' },
  { value: 'science', label: '과학' },
  { value: 'other', label: '기타' },
]

const SUBJECT_LABELS = Object.fromEntries(SUBJECTS.map((s) => [s.value, s.label])) as Record<string, string>

export function subjectLabel(value: string | null | undefined) {
  if (!value) return ''
  return SUBJECT_LABELS[value] ?? value
}
