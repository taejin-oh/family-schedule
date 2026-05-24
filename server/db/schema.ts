import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export type Day = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'

export type ScheduleSlot = {
  day: Day
  start: string  // 'HH:MM'
  end: string    // 'HH:MM'
}

type ScheduleRule = {
  slots: ScheduleSlot[]
} | null

export const academies = sqliteTable('academies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  color: text('color').notNull(),
  scheduleRule: text('schedule_rule', { mode: 'json' }).$type<ScheduleRule>(),
  location: text('location'),
  notes: text('notes'),
  extractionHint: text('extraction_hint'),   // AI에게 줄 학원별 파일 해석 힌트 (영구 디폴트)
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const homeworkBatches = sqliteTable('homework_batches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  academyId: integer('academy_id').notNull().references(() => academies.id),
  capturedAt: integer('captured_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  status: text('status', { enum: ['pending','processing','ready','committed','failed'] }).notNull().default('pending'),
  userHint: text('user_hint'),               // 이 batch에 실제로 사용된 힌트 스냅샷
  providerUsed: text('provider_used'),
  modelUsed: text('model_used'),
  rawResponse: text('raw_response'),
  failureReason: text('failure_reason'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const homeworkPhotos = sqliteTable('homework_photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  batchId: integer('batch_id').notNull().references(() => homeworkBatches.id, { onDelete: 'cascade' }),
  originalPath: text('original_path').notNull(),
  resizedPath: text('resized_path').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  bytes: integer('bytes').notNull(),
})

export const homeworkItems = sqliteTable('homework_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  batchId: integer('batch_id').notNull().references(() => homeworkBatches.id, { onDelete: 'cascade' }),
  academyId: integer('academy_id').notNull().references(() => academies.id),
  title: text('title').notNull(),
  notes: text('notes'),                      // 책 이름, 단원, 페이지, 분량 등 부가 정보
  dueDate: text('due_date'),                 // 'YYYY-MM-DD' or null
  source: text('source', { enum: ['ai','manual'] }).notNull(),
  aiOriginalTitle: text('ai_original_title'),
  isCommitted: integer('is_committed', { mode: 'boolean' }).notNull().default(false),
  doneAt: integer('done_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey().default(1),  // single-row table
  visionProvider: text('vision_provider').notNull().default('claude'),
  visionModel: text('vision_model').notNull().default('claude-sonnet-4-6'),
})
