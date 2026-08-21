CREATE TABLE `print_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`name` text NOT NULL,
	`source_file_name` text,
	`filament_id` integer,
	`duration_minutes` integer,
	`filament_used_g` real,
	`material_cost` real,
	`energy_cost` real,
	`total_cost` real,
	`outcome` text NOT NULL,
	`quality_rating` integer,
	`defects` text,
	`notes` text,
	`settings_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`filament_id`) REFERENCES `filaments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `filaments` ADD `supplier` text;--> statement-breakpoint
ALTER TABLE `filaments` ADD `purchase_date` text;--> statement-breakpoint
ALTER TABLE `filaments` ADD `invoice_number` text;--> statement-breakpoint
ALTER TABLE `filaments` ADD `purchase_total` real;--> statement-breakpoint
ALTER TABLE `filaments` ADD `purchase_quantity` integer;--> statement-breakpoint
ALTER TABLE `filaments` ADD `cfs_slot` text;--> statement-breakpoint
ALTER TABLE `filaments` ADD `nozzle_diameter` real;--> statement-breakpoint
ALTER TABLE `filaments` ADD `last_dried_at` text;