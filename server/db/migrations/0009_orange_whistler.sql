CREATE TABLE `redemptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reward_settings_id` integer NOT NULL,
	`reward_name` text NOT NULL,
	`reward_emoji` text NOT NULL,
	`target_count` integer NOT NULL,
	`redeemed_at` integer DEFAULT (unixepoch()) NOT NULL,
	`notes` text,
	FOREIGN KEY (`reward_settings_id`) REFERENCES `reward_settings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reward_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`emoji` text DEFAULT '🎁' NOT NULL,
	`target_count` integer NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stamps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`for_date` text,
	`kind` text NOT NULL,
	`redemption_id` integer,
	`awarded_at` integer DEFAULT (unixepoch()) NOT NULL,
	`notes` text,
	FOREIGN KEY (`redemption_id`) REFERENCES `redemptions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stamps_for_date_unique` ON `stamps` (`for_date`);
