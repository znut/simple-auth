import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import svelte from "eslint-plugin-svelte"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
	{
		ignores: [
			"**/.svelte-kit/**",
			"**/.wrangler/**",
			"**/build/**",
			"**/coverage/**",
			"**/dist/**",
			"**/node_modules/**",
			"**/playwright-report/**",
			"**/test-results/**",
			"**/migrations/**",
			"**/cf-bindings.d.ts",
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs["flat/recommended"],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				...globals.serviceworker,
			},
		},
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
					destructuredArrayIgnorePattern: "^_",
					varsIgnorePattern: "^_",
				},
			],
		},
	},
	{
		files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser,
			},
		},
	},
	eslintConfigPrettier
)
