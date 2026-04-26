import { describe, expect, it, vi } from "vitest"

const { getDbOrThrow, resolvePostAuthRedirect, sql } = vi.hoisted(() => ({
	getDbOrThrow: vi.fn(),
	resolvePostAuthRedirect: vi.fn(),
	sql: vi.fn(() => ({
		mapWith: vi.fn(() => "count-expression"),
	})),
}))

vi.mock("$lib/server/db", () => ({
	getDbOrThrow,
}))

vi.mock("$lib/server/helpers", () => ({
	resolvePostAuthRedirect,
}))

vi.mock("drizzle-orm", () => ({
	sql,
}))

vi.mock("$lib/server/schema", () => ({
	users: "users-table",
}))

import { load } from "./+page.server"

describe("auth landing page load", () => {
	it("exposes bootstrap mode when no users exist", async () => {
		const db = {
			select: vi.fn(() => ({
				from: vi.fn().mockReturnThis(),
				get: vi.fn().mockResolvedValue({ count: 0 }),
			})),
		}
		getDbOrThrow.mockReturnValue(db)
		resolvePostAuthRedirect.mockReturnValue(null)

		const result = await load({
			locals: {
				db: {} as never,
				user: null,
			},
			url: new URL("https://auth.example.com/"),
		} as never)

		expect(result).toMatchObject({
			canBootstrapAdmin: true,
			next: null,
			user: null,
		})
	})

	it("disables bootstrap mode after the first user exists", async () => {
		const db = {
			select: vi.fn(() => ({
				from: vi.fn().mockReturnThis(),
				get: vi.fn().mockResolvedValue({ count: 3 }),
			})),
		}
		getDbOrThrow.mockReturnValue(db)
		resolvePostAuthRedirect.mockReturnValue(null)

		const result = await load({
			locals: {
				db: {} as never,
				user: null,
			},
			url: new URL("https://auth.example.com/"),
		} as never)

		expect(result).toMatchObject({
			canBootstrapAdmin: false,
		})
	})
})
