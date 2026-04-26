import { sveltekit } from "@sveltejs/kit/vite"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"
import { defineConfig } from "vitest/config"

const devHost = "auth.ex.localhost"
const devPort = 5100

function customDevUrlPlugin(): Plugin {
	return {
		name: "custom-dev-url",
		configureServer(server) {
			server.printUrls = () => {
				console.log(`  Local:   http://${devHost}:${devPort}/`)
			}
		},
	}
}

export default defineConfig({
	plugins: [customDevUrlPlugin(), tailwindcss(), sveltekit()],
	resolve: {
		alias: {
			"@znut/simple-auth-lib": fileURLToPath(
				new URL("./simple-auth-lib/src/index.ts", import.meta.url)
			),
		},
	},
	server: {
		host: "0.0.0.0",
		port: devPort,
		strictPort: true,
	},
	test: {
		include: [
			"src/**/*.{test,spec}.{js,ts}",
			"simple-auth-lib/src/**/*.{test,spec}.{js,ts}",
		],
		environment: "node",
	},
})
