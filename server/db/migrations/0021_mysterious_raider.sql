ALTER TABLE `app_settings` ADD `telegram_weekly_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `app_settings` ADD `telegram_weekly_time` text DEFAULT '21:00' NOT NULL;