import adapter from "@sveltejs/adapter-cloudflare"
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"

/** @type {import("@sveltejs/kit").Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		alias: {
			"@znut/simple-auth-lib": "./simple-auth-lib/src/index.ts",
		},
		adapter: adapter({
			platformProxy: {
				configPath: "wrangler.e2e.jsonc",
				persist: false,
			},
		}),
	},
}

export default config
