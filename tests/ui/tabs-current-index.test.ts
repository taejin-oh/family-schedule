import { describe, it, expect } from 'vitest'
import { TABS, currentTabIndex } from '@/lib/tabs'

// TABS 순서 가정에 의존하므로, 깨지면 즉시 알 수 있도록 명시적으로 잠가둠.
const HOME_IDX = TABS.findIndex((t) => t.href === '/')

describe('currentTabIndex', () => {
  it('정확 매칭 — 각 TAB href는 자기 자신의 index를 반환', () => {
    TABS.forEach((t, i) => {
      expect(currentTabIndex(t.href)).toBe(i)
    })
  })

  it('sub-path prefix 매칭 — 가장 긴 href 우선', () => {
    expect(currentTabIndex('/academies/2')).toBe(
      TABS.findIndex((t) => t.href === '/academies'),
    )
    expect(currentTabIndex('/homework/upload/history')).toBe(
      TABS.findIndex((t) => t.href === '/homework/upload'),
    )
    expect(currentTabIndex('/admin/settings/foo')).toBe(
      TABS.findIndex((t) => t.href === '/admin/settings'),
    )
  })

  it('홈은 정확 매칭만 — 임의 경로의 prefix로 매칭되지 않음', () => {
    expect(currentTabIndex('/day/2026-05-28')).toBe(-1)
    expect(currentTabIndex('/homework/batches/1')).toBe(-1)
  })

  it('/dashboard alias — 홈 인덱스로 매핑되어 swipe가 동작', () => {
    // 모바일에서 / → "관리" → /dashboard 진입 후 좌우 swipe로 인접 탭 이동을
    // 가능하게 하기 위한 alias. -1이면 swipe-nav가 스와이프를 무효 처리하므로
    // 반드시 유효 인덱스를 반환해야 함.
    expect(currentTabIndex('/dashboard')).toBe(HOME_IDX)
  })

  it('매칭되지 않는 경로는 -1', () => {
    expect(currentTabIndex('/admin/stickers')).toBe(-1)
    expect(currentTabIndex('/unknown')).toBe(-1)
  })
})
