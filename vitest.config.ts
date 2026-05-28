import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      'server-only': resolve(__dirname, 'tests/__mocks__/server-only.ts'),
      'next/cache': resolve(__dirname, 'tests/__mocks__/next-cache.ts'),
      'next/headers': resolve(__dirname, 'tests/__mocks__/next-headers.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
  },
})
