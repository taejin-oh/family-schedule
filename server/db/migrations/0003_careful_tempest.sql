PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_app_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`vision_provider` text DEFAULT 'claude' NOT NULL,
	`vision_model` text DEFAULT 'claude-opus-4-7' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_app_settings`("id", "vision_provider", "vision_model") SELECT "id", "vision_provider", "vision_model" FROM `app_settings`;--> statement-breakpoint
DROP TABLE `app_settings`;--> statement-breakpoint
ALTER TABLE `__new_app_settings` RENAME TO `app_settings`;--> statement-breakpoint
-- Upgrade pre-existing setting rows to the new default (was sonnet, now opus)
UPDATE `app_settings` SET `vision_model` = 'claude-opus-4-7' WHERE `vision_model` = 'claude-sonnet-4-6';--> statement-breakpoint
PRAGMA foreign_keys=ON;