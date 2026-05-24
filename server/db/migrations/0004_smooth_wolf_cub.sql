CREATE TABLE `recurring_task_completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`completion_date` text NOT NULL,
	`done_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `recurring_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recurring_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`color` text DEFAULT '#64748b' NOT NULL,
	`days_of_week` text NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
