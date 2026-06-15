import { describe, it, expect } from 'vitest'
import { TABS, currentTabIndex } from '@/lib/tabs'

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

  it('/dashboard 는 이제 홈(/)으로 리다이렉트 — 탭이 아니므로 -1', () => {
    // 부모 관리(할 일)가 홈(/)으로 이동하면서 /dashboard 는 redirect-only가 됐다.
    // 더 이상 swipe 대상 탭이 아니므로 alias 없이 -1을 반환한다.
    // (아이홈은 이제 /kids 정식 탭 — 위 '정확 매칭' 테스트가 커버.)
    expect(currentTabIndex('/dashboard')).toBe(-1)
  })

  it('매칭되지 않는 경로는 -1', () => {
    expect(currentTabIndex('/admin/stickers')).toBe(-1)
    expect(currentTabIndex('/unknown')).toBe(-1)
  })
})
