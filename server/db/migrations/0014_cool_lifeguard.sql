CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`local_date` text NOT NULL,
	`session_id` text,
	`category` text NOT NULL,
	`event` text NOT NULL,
	`props_json` text,
	`path` text,
	`user_agent` text
);
--> statement-breakpoint
CREATE INDEX `events_local_date_idx` ON `events` (`local_date`);--> statement-breakpoint
CREATE INDEX `events_category_idx` ON `events` (`category`);--> statement-breakpoint
CREATE INDEX `events_event_idx` ON `events` (`event`);