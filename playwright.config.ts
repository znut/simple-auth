import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL: "http://auth.e2e.localhost:5101",
		trace: "retain-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: "bun run db:migrate:e2e & bun run preview --port 5101",
		url: "http://auth.e2e.localhost:5101",
		reuseExistingServer: false,
		timeout: 120_000,
		env: {
			SVELTE_CONFIG: "svelte.config.e2e.js",
		},
	},
})
