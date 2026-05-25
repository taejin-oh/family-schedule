CREATE TABLE `digest_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`sent_at` integer NOT NULL,
	`date_iso` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `digest_log_kind_date` ON `digest_log` (`kind`,`date_iso`);
