import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`)
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

import UploadHistoryPage from '@/app/homework/upload/history/page'

describe('UploadHistoryPage', () => {
  it('redirects to upload chooser when academy query is missing', async () => {
    await expect(
      UploadHistoryPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NEXT_REDIRECT:/homework/upload')
  })
})
