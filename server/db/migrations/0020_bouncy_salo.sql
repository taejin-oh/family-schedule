CREATE TABLE `weekly_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_start_iso` text NOT NULL,
	`week_end_iso` text NOT NULL,
	`stats` text NOT NULL,
	`narrative` text NOT NULL,
	`model` text NOT NULL,
	`generated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_reports_week_start_iso_unique` ON `weekly_reports` (`week_start_iso`);