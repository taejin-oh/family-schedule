import type { jobs } from './schema'
import type { InferSelectModel } from 'drizzle-orm'

export type Job = InferSelectModel<typeof jobs>
export type JobType = 'extract_homework'
export type ExtractHomeworkPayload = { batchId: number }
