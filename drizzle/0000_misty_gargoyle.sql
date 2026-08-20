CREATE TABLE `calibrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`filament_id` integer NOT NULL,
	`calibration_type` text NOT NULL,
	`values_json` text NOT NULL,
	`notes` text,
	`performed_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`filament_id`) REFERENCES `filaments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `filaments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`brand` text NOT NULL,
	`product_line` text NOT NULL,
	`material` text NOT NULL,
	`color_name` text NOT NULL,
	`color_hex` text,
	`spool_weight_g` real,
	`remaining_g` real,
	`lot_number` text,
	`opened_at` text,
	`storage_location` text,
	`storage_humidity` real,
	`profile_name` text,
	`nozzle_temp_min` integer,
	`nozzle_temp_max` integer,
	`bed_temp_min` integer,
	`bed_temp_max` integer,
	`max_volumetric_speed` real,
	`flow_ratio` real,
	`pressure_advance` real,
	`drying_temp` integer,
	`drying_hours` real,
	`cfs_compatible` integer DEFAULT true NOT NULL,
	`abrasive` integer DEFAULT false NOT NULL,
	`calibrated` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `filaments_user_identity_idx` ON `filaments` (`user_email`,`brand`,`product_line`,`material`,`color_name`);--> statement-breakpoint
CREATE TABLE `print_projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`name` text NOT NULL,
	`source_file_name` text,
	`filament_id` integer,
	`criteria_json` text NOT NULL,
	`recommendation_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`filament_id`) REFERENCES `filaments`(`id`) ON UPDATE no action ON DELETE no action
);
