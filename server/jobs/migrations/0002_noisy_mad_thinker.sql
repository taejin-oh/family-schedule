CREATE TABLE `academy_reminder_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date_iso` text NOT NULL,
	`slot_key` text NOT NULL,
	`sent_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `academy_reminder_log_date_slot` ON `academy_reminder_log` (`date_iso`,`slot_key`);
