import { describe, it, expect } from 'vitest'
import { buildPrompt } from '@/server/llm/prompt'

describe('buildPrompt', () => {
  it('includes academy name, subject, next session, image paths', () => {
    const out = buildPrompt({
      academy: { name: '수학학원', subject: 'math', nextSessionAt: new Date('2026-05-27') },
      imagePaths: ['/abs/a.jpg', '/abs/b.jpg'],
    })
    expect(out).toContain('수학학원')
    expect(out).toContain('math')
    expect(out).toContain('2026-05-27')
    expect(out).toContain('/abs/a.jpg')
    expect(out).toContain('/abs/b.jpg')
    expect(out).toContain('"items"')
  })

  it('uses "미정" when nextSessionAt is null', () => {
    const out = buildPrompt({
      academy: { name: 'X', subject: 'other', nextSessionAt: null },
      imagePaths: ['/abs/a.jpg'],
    })
    expect(out).toContain('미정')
  })
})
