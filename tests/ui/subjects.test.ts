import { describe, expect, it } from 'vitest'
import { subjectLabel } from '@/lib/subjects'

describe('subjectLabel', () => {
  it('renders PE as the Korean label used in the academy form', () => {
    expect(subjectLabel('pe')).toBe('체육')
  })

  it('falls back to the raw value for unknown subjects', () => {
    expect(subjectLabel('robotics')).toBe('robotics')
  })
})
