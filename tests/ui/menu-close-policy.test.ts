import { describe, expect, it } from 'vitest'
import { shouldIgnoreTransientLongPressClose } from '@/lib/menu-close-policy'

describe('shouldIgnoreTransientLongPressClose', () => {
  it('keeps a long-press opened menu visible through the immediate outside close event', () => {
    expect(
      shouldIgnoreTransientLongPressClose({
        nextOpen: false,
        openedByLongPress: true,
        reason: 'outside-press',
      }),
    ).toBe(true)
  })

  it('allows ordinary menu closes', () => {
    expect(
      shouldIgnoreTransientLongPressClose({
        nextOpen: false,
        openedByLongPress: false,
        reason: 'outside-press',
      }),
    ).toBe(false)
  })
})
