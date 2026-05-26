import { describe, expect, it } from 'vitest'
import { normalizeSlotAfterEdit, normalizeTimeDraft, sanitizeTimeDraft } from '@/lib/time-slots'

describe('academy schedule time helpers', () => {
  it('keeps the visible draft as numeric 24-hour text', () => {
    expect(sanitizeTimeDraft('오후 7:30')).toBe('7:30')
  })

  it('normalizes compact 24-hour input to HH:MM', () => {
    const res = normalizeTimeDraft('930', '19:00')
    expect(res.value).toBe('09:30')
    expect(res.warning).toContain('09:30')
  })

  it('clamps impossible clock values into the supported 00:00-24:00 range', () => {
    const res = normalizeTimeDraft('29:90', '19:00')
    expect(res.value).toBe('24:00')
    expect(res.warning).toContain('24:00')
  })

  it('moves the end time after a later start time', () => {
    const res = normalizeSlotAfterEdit({ day: 'mon', start: '21:00', end: '19:00' }, 'start')
    expect(res.slot).toMatchObject({ start: '21:00', end: '22:00' })
    expect(res.warning).toContain('자동 조정')
  })

  it('moves the start time before an earlier end time', () => {
    const res = normalizeSlotAfterEdit({ day: 'mon', start: '21:00', end: '19:00' }, 'end')
    expect(res.slot).toMatchObject({ start: '18:00', end: '19:00' })
    expect(res.warning).toContain('자동 조정')
  })
})
