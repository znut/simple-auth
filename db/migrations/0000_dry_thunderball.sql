CREATE TABLE `passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`public_key` blob NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`device_type` text,
	`backed_up` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_passkeys_user_id` ON `passkeys` (`user_id`);--> statement-breakpoint
CREATE TABLE `registration_invitations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`nonce` text NOT NULL,
	`expires_at` text NOT NULL,
	`issued_by` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registration_invitations_userId_unique` ON `registration_invitations` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `registration_invitations_nonce_unique` ON `registration_invitations` (`nonce`);--> statement-breakpoint
CREATE INDEX `idx_registration_invitations_nonce` ON `registration_invitations` (`nonce`);--> statement-breakpoint
CREATE INDEX `idx_registration_invitations_expires_at` ON `registration_invitations` (`expires_at`);--> statement-breakpoint
CREATE TABLE `roles` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `roles` (`key`, `name`, `description`, `is_system`, `created_at`, `updated_at`) VALUES
	('owner', 'Owner', 'Full access.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('user', 'User', 'Standard user.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);--> statement-breakpoint

CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` integer NOT NULL,
	`role_key` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `role_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_key`) REFERENCES `roles`(`key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_user_roles_user_id` ON `user_roles` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_roles_role_key` ON `user_roles` (`role_key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`approved_by` integer,
	`approved_at` text,
	`registration_challenge` text,
	`authentication_challenge` text,
	`webauthn_user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_login_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
