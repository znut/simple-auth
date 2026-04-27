CREATE TABLE `auth_session_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`return_url` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auth_session_codes_expires_at` ON `auth_session_codes` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_auth_session_codes_return_url` ON `auth_session_codes` (`return_url`);