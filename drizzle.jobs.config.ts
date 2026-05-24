import type { Config } from 'drizzle-kit'

export default {
  schema: './server/jobs/schema.ts',
  out: './server/jobs/migrations',
  dialect: 'sqlite',
  dbCredentials: { url: './data/jobs.db' },
  strict: true,
} satisfies Config
