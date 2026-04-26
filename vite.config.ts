import { sveltekit } from "@sveltejs/kit/vite"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	resolve: {
		alias: {
			"@znut/simple-auth-lib": fileURLToPath(
				new URL("./simple-auth-lib/src/index.ts", import.meta.url)
			),
		},
	},
	test: {
		include: [
			"src/**/*.{test,spec}.{js,ts}",
			"simple-auth-lib/src/**/*.{test,spec}.{js,ts}",
		],
		environment: "node",
	},
})
