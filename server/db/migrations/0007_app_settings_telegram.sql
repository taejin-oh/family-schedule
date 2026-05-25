ALTER TABLE `app_settings` ADD `telegram_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `app_settings` ADD `telegram_morning_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `app_settings` ADD `telegram_morning_time` text DEFAULT '07:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `app_settings` ADD `telegram_evening_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `app_settings` ADD `telegram_evening_time` text DEFAULT '21:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `app_settings` ADD `telegram_midday_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `app_settings` ADD `telegram_midday_time` text DEFAULT '12:00' NOT NULL;
