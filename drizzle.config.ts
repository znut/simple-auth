import { defineConfig } from "drizzle-kit"

export default defineConfig({
	casing: "snake_case",
	dialect: "sqlite",
	schema: "./src/lib/server/schema.ts",
	out: "./db/migrations",
})
