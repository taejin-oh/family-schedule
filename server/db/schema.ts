import { sqliteTable, integer, text, uniqueIndex, real, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
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
  // Cleanup lifecycle.
  // archivedAt: 모든 item이 done + 가장 늦은 done이 7일 이상 전이라 정리 후보로 표시된 시각.
  // photosCleanedAt: archivedAt 후 90일이 지나 photos 파일·row가 실제 삭제된 시각.
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  photosCleanedAt: integer('photos_cleaned_at', { mode: 'timestamp' }),
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
  confidence: real('confidence'),
  confidenceReason: text('confidence_reason'),   // confidence < 0.7일 때 AI가 짧게 적은 이유. 리뷰 화면 보조 정보.
  sourcePhotoId: integer('source_photo_id').references(() => homeworkPhotos.id, { onDelete: 'set null' }),
  isCommitted: integer('is_committed', { mode: 'boolean' }).notNull().default(false),
  doneAt: integer('done_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey().default(1),  // single-row table
  visionProvider: text('vision_provider').notNull().default('claude'),
  visionModel: text('vision_model').notNull().default('claude-opus-4-7'),
  telegramEnabled: integer('telegram_enabled', { mode: 'boolean' }).notNull().default(false),
  telegramMorningEnabled: integer('telegram_morning_enabled', { mode: 'boolean' }).notNull().default(true),
  telegramMorningTime: text('telegram_morning_time').notNull().default('07:00'),
  telegramEveningEnabled: integer('telegram_evening_enabled', { mode: 'boolean' }).notNull().default(true),
  telegramEveningTime: text('telegram_evening_time').notNull().default('21:00'),
  telegramMiddayEnabled: integer('telegram_midday_enabled', { mode: 'boolean' }).notNull().default(true),
  telegramMiddayTime: text('telegram_midday_time').notNull().default('12:00'),
  // 학원 시작/종료 ±N분 전 알림. minutes는 5~30 권장.
  telegramAcademyReminderEnabled: integer('telegram_academy_reminder_enabled', { mode: 'boolean' }).notNull().default(true),
  telegramAcademyReminderMinutes: integer('telegram_academy_reminder_minutes').notNull().default(10),
  // 아이 홈 빈 상태 카피 (null이면 DEFAULT_EMPTY_STATES 사용)
  emptyStateCopy: text('empty_state_copy', { mode: 'json' }).$type<Array<{ emoji: string; title: string; sub: string }>>(),
})

export const recurringTasks = sqliteTable('recurring_tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  notes: text('notes'),
  color: text('color').notNull().default('#64748b'),  // slate
  cadence: text('cadence').$type<'daily'|'weekly'>().notNull().default('daily'),
  daysOfWeek: text('days_of_week', { mode: 'json' }).$type<Array<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'>>().notNull(),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const recurringTaskCompletions = sqliteTable('recurring_task_completions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => recurringTasks.id, { onDelete: 'cascade' }),
  completionDate: text('completion_date').notNull(),  // 'YYYY-MM-DD' (the local day this counts as done for)
  doneAt: integer('done_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('rtc_task_date_unique').on(t.taskId, t.completionDate),
])

// === Sticker / reward system ===

// 활성 보상은 한 번에 1개 (archivedAt IS NULL인 가장 최근 row가 active).
// 보상 내용을 바꾸면 기존 row를 archive하고 새 row를 insert해서 변경 이력을 남긴다.
export const rewardSettings = sqliteTable('reward_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  emoji: text('emoji').notNull().default('🎁'),
  targetCount: integer('target_count').notNull(),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

// 보상 지급 이력. 지급 시점의 보상 이름/이모지/목표를 snapshot.
export const redemptions = sqliteTable('redemptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  rewardSettingsId: integer('reward_settings_id').notNull().references(() => rewardSettings.id),
  rewardName: text('reward_name').notNull(),
  rewardEmoji: text('reward_emoji').notNull(),
  targetCount: integer('target_count').notNull(),
  redeemedAt: integer('redeemed_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  notes: text('notes'),
})

// 적립된 스티커. auto=오늘 active 0 도달 시 자동, manual=부모 수동 추가.
// auto 스티커는 forDate UNIQUE (한 날짜에 하나). manual은 forDate NULL.
// 보상으로 redeem 된 스티커는 redemptionId가 세팅됨 (회수 불가, 카운트에서 제외).
export const stamps = sqliteTable('stamps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  forDate: text('for_date'),
  kind: text('kind', { enum: ['auto', 'manual'] }).notNull(),
  redemptionId: integer('redemption_id').references((): AnySQLiteColumn => redemptions.id, { onDelete: 'set null' }),
  awardedAt: integer('awarded_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  notes: text('notes'),
}, (t) => [
  uniqueIndex('stamps_for_date_unique').on(t.forDate),
])
