import { describe, it, expect } from 'vitest'
import { groupDone, type Item } from '@/app/academies/[id]/_components/academy-items'

// 2026-05-28 (목요일) 기준으로 분류 검증
const NOW = new Date('2026-05-28T12:00:00').getTime()
// 이번 주 시작: 2026-05-25 (월) 00:00
// 지난 주 시작: 2026-05-18 (월) 00:00

function item(id: number, title: string, doneAt: Date | null, dueDate: string | null = null): Item {
  return { id, title, notes: null, dueDate, doneAt, score: null, scoreReason: null }
}

describe('groupDone', () => {
  it('returns empty array for no items', () => {
    expect(groupDone([], NOW)).toEqual([])
  })

  it('puts items done in current week into 이번 주 group', () => {
    const items = [
      item(1, 'a', new Date('2026-05-26T10:00:00')),
      item(2, 'b', new Date('2026-05-28T11:00:00')),
    ]
    const groups = groupDone(items, NOW)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('this-week')
    expect(groups[0].label).toBe('이번 주')
    // 최신 done 먼저
    expect(groups[0].items.map((i) => i.id)).toEqual([2, 1])
  })

  it('puts items done in previous week into 지난 주 group', () => {
    const items = [
      item(1, 'a', new Date('2026-05-19T10:00:00')),  // 지난주 화요일
      item(2, 'b', new Date('2026-05-24T22:00:00')),  // 지난주 일요일 (이번 주 시작 직전)
    ]
    const groups = groupDone(items, NOW)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('last-week')
    expect(groups[0].label).toBe('지난 주')
    expect(groups[0].items.map((i) => i.id)).toEqual([2, 1])
  })

  it('puts older items into monthly groups, newest month first', () => {
    const items = [
      item(1, 'apr',  new Date('2026-04-10T10:00:00')),
      item(2, 'mar1', new Date('2026-03-15T10:00:00')),
      item(3, 'mar2', new Date('2026-03-20T10:00:00')),
    ]
    const groups = groupDone(items, NOW)
    expect(groups.map((g) => g.label)).toEqual(['2026년 4월', '2026년 3월'])
    expect(groups[0].items.map((i) => i.id)).toEqual([1])
    expect(groups[1].items.map((i) => i.id)).toEqual([3, 2])  // 3월 내에서 최신 먼저
  })

  it('mixes this-week, last-week, and monthly with correct ordering', () => {
    const items = [
      item(1, 'tw',   new Date('2026-05-27T10:00:00')),    // 이번주
      item(2, 'lw',   new Date('2026-05-22T10:00:00')),    // 지난주 금
      item(3, 'apr',  new Date('2026-04-10T10:00:00')),
      item(4, 'feb',  new Date('2026-02-05T10:00:00')),
    ]
    const groups = groupDone(items, NOW)
    expect(groups.map((g) => g.key)).toEqual(['this-week', 'last-week', '2026-04', '2026-02'])
  })

  it('puts items without doneAt into 날짜 미상 last', () => {
    const items = [
      item(1, 'tw',     new Date('2026-05-27T10:00:00')),
      item(2, 'unknown', null),
    ]
    const groups = groupDone(items, NOW)
    expect(groups.map((g) => g.key)).toEqual(['this-week', 'no-date'])
    expect(groups[1].label).toBe('날짜 미상')
    expect(groups[1].items.map((i) => i.id)).toEqual([2])
  })

  it('treats Sunday as last day of current week (Korean Mon-start)', () => {
    // 일요일 = 그 주의 끝. 2026-05-31 일요일에 완료한 항목은 이번 주 안.
    const sundayNow = new Date('2026-05-31T20:00:00').getTime()
    const items = [
      item(1, 'mon', new Date('2026-05-25T10:00:00')),  // 이번주 월
      item(2, 'sun', new Date('2026-05-31T18:00:00')),  // 같은 주 일요일
    ]
    const groups = groupDone(items, sundayNow)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('this-week')
    expect(groups[0].items.map((i) => i.id)).toEqual([2, 1])
  })
})
