import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

type ScheduleRule = {
  days: Array<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'>
  start: string  // 'HH:MM'
  end: string    // 'HH:MM'
} | null

export const academies = sqliteTable('academies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  color: text('color').notNull(),
  scheduleRule: text('schedule_rule', { mode: 'json' }).$type<ScheduleRule>(),
  location: text('location'),
  notes: text('notes'),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const homeworkBatches = sqliteTable('homework_batches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  academyId: integer('academy_id').notNull().references(() => academies.id),
  capturedAt: integer('captured_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  status: text('status', { enum: ['pending','processing','ready','committed','failed'] }).notNull().default('pending'),
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
