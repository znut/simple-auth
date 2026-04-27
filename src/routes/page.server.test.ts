import { describe, expect, it, vi } from "vitest"

const { appendSessionTokenToUrl, getDbOrThrow, resolvePostAuthRedirect, sql } =
	vi.hoisted(() => ({
		appendSessionTokenToUrl: vi.fn(),
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

vi.mock("$lib/server/session", () => ({
	appendSessionTokenToUrl,
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

	it("appends the active session token when redirecting an authenticated user to next", async () => {
		resolvePostAuthRedirect.mockReturnValue(
			"https://dashboard.example.com/auth/callback?next=%2F"
		)
		appendSessionTokenToUrl.mockReturnValue(
			"https://dashboard.example.com/auth/callback?next=%2F&simple_auth_token=fresh-session-token"
		)

		await expect(
			load({
				locals: {
					db: {} as never,
					sessionToken: "fresh-session-token",
					user: {
						id: 7,
						email: "lead@example.com",
						fullName: "Factory Lead",
						role: "owner",
						roleName: "Owner",
						roles: [{ key: "owner", name: "Owner" }],
						isActive: true,
					},
				},
				url: new URL(
					"https://auth.example.com/?next=https%3A%2F%2Fdashboard.example.com%2Fauth%2Fcallback%3Fnext%3D%252F"
				),
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location:
				"https://dashboard.example.com/auth/callback?next=%2F&simple_auth_token=fresh-session-token",
		})

		expect(appendSessionTokenToUrl).toHaveBeenCalledWith(
			"https://dashboard.example.com/auth/callback?next=%2F",
			"fresh-session-token"
		)
	})
})
