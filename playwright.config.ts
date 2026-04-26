import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL: "http://auth.ex.localhost:5100",
		trace: "retain-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: "vite dev",
		url: "http://auth.ex.localhost:5100",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
})
