import adapter from "@sveltejs/adapter-cloudflare"
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"

const wranglerConfigPath = process.env.WRANGLER_CONFIG_PATH ?? "wrangler.jsonc"
const wranglerEnvironment = process.env.CLOUDFLARE_ENV

/** @type {import("@sveltejs/kit").Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		alias: {
			"@znut/simple-auth-lib": "./simple-auth-lib/src/index.ts",
		},
		adapter: adapter({
			platformProxy: {
				configPath: wranglerConfigPath,
				environment: wranglerEnvironment,
				persist: true,
			},
		}),
	},
}

export default config
