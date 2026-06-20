PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_homework_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`academy_id` integer NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`due_date` text,
	`pinned_date` text,
	`source` text NOT NULL,
	`ai_original_title` text,
	`confidence` real,
	`confidence_reason` text,
	`source_photo_id` integer,
	`is_committed` integer DEFAULT false NOT NULL,
	`done_at` integer,
	`score` integer,
	`score_reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `homework_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`academy_id`) REFERENCES `academies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_photo_id`) REFERENCES `homework_photos`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_homework_items`("id", "batch_id", "academy_id", "title", "notes", "due_date", "pinned_date", "source", "ai_original_title", "confidence", "confidence_reason", "source_photo_id", "is_committed", "done_at", "score", "score_reason", "created_at") SELECT "id", "batch_id", "academy_id", "title", "notes", "due_date", "pinned_date", "source", "ai_original_title", "confidence", "confidence_reason", "source_photo_id", "is_committed", "done_at", "score", "score_reason", "created_at" FROM `homework_items`;--> statement-breakpoint
DROP TABLE `homework_items`;--> statement-breakpoint
ALTER TABLE `__new_homework_items` RENAME TO `homework_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `homework_items_committed_done` ON `homework_items` (`is_committed`,`done_at`);--> statement-breakpoint
CREATE INDEX `homework_items_academy_due` ON `homework_items` (`academy_id`,`due_date`);