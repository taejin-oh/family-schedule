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
  kind: text('kind', { enum: ['morning', 'evening', 'midday', 'weekly'] }).notNull(),
  sentAt: integer('sent_at').notNull(),  // unix ms
  dateIso: text('date_iso').notNull(),   // 'YYYY-MM-DD' local (Asia/Seoul)
}, (t) => [
  uniqueIndex('digest_log_kind_date').on(t.kind, t.dateIso),
])

// 학원 시작/종료 ±N분 알림 발송 영속 dedupe.
// (date_iso, slot_key) UNIQUE — process restart/자정 경계에도 중복 발송 방지.
// slot_key 형식: "{academyId}|{day}|{start}|{start|end}" (academy-reminders.ts 참조).
export const academyReminderLog = sqliteTable('academy_reminder_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dateIso: text('date_iso').notNull(),   // 'YYYY-MM-DD' (Asia/Seoul)
  slotKey: text('slot_key').notNull(),
  sentAt: integer('sent_at').notNull(),  // unix ms
}, (t) => [
  uniqueIndex('academy_reminder_log_date_slot').on(t.dateIso, t.slotKey),
])
