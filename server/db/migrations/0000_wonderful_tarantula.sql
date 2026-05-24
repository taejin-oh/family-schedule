CREATE TABLE `academies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`color` text NOT NULL,
	`schedule_rule` text,
	`location` text,
	`notes` text,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`vision_provider` text DEFAULT 'claude' NOT NULL,
	`vision_model` text DEFAULT 'claude-sonnet-4-6' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `homework_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`academy_id` integer NOT NULL,
	`captured_at` integer DEFAULT (unixepoch()) NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_used` text,
	`model_used` text,
	`raw_response` text,
	`failure_reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`academy_id`) REFERENCES `academies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `homework_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`academy_id` integer NOT NULL,
	`title` text NOT NULL,
	`due_date` text,
	`source` text NOT NULL,
	`ai_original_title` text,
	`is_committed` integer DEFAULT false NOT NULL,
	`done_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `homework_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`academy_id`) REFERENCES `academies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `homework_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`original_path` text NOT NULL,
	`resized_path` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`bytes` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `homework_batches`(`id`) ON UPDATE no action ON DELETE cascade
);
