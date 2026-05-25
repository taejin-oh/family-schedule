ALTER TABLE `homework_items` ADD `confidence` real;
--> statement-breakpoint
ALTER TABLE `homework_items` ADD `source_photo_id` integer REFERENCES `homework_photos`(`id`) ON DELETE set null;
