import { sqliteTable, integer, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['extract_homework'] }).notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  status: text('status', { enum: ['queued','running','done','failed'] }).notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  claimedAt: integer('claimed_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
})

export const digestLog = sqliteTable('digest_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind', { enum: ['morning', 'evening', 'midday'] }).notNull(),
  sentAt: integer('sent_at').notNull(),  // unix ms
  dateIso: text('date_iso').notNull(),   // 'YYYY-MM-DD' local (Asia/Seoul)
}, (t) => [
  uniqueIndex('digest_log_kind_date').on(t.kind, t.dateIso),
])
