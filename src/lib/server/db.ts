import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1"
import { schema } from "./schema"

export type AppDatabase = DrizzleD1Database<typeof schema>

export function createDb(database: D1Database): AppDatabase {
	return drizzle(database, {
		schema,
		casing: "snake_case",
	})
}

export function getDbOrThrow(db?: AppDatabase) {
	if (!db) {
		throw new Error("Auth database binding is not configured")
	}

	return db
}
