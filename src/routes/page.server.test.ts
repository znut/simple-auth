import { describe, expect, it, vi } from "vitest"

const {
	appendSessionExchangeCodeToUrl,
	createSessionExchangeCode,
	getDbOrThrow,
	removeSessionExchangeCodeFromUrl,
	resolveAllowReturnUrls,
	resolvePostAuthRedirect,
	sql,
} = vi.hoisted(() => ({
	appendSessionExchangeCodeToUrl: vi.fn(),
	createSessionExchangeCode: vi.fn(),
	getDbOrThrow: vi.fn(),
	removeSessionExchangeCodeFromUrl: vi.fn(),
	resolveAllowReturnUrls: vi.fn(),
	resolvePostAuthRedirect: vi.fn(),
	sql: vi.fn(() => ({
		mapWith: vi.fn(() => "count-expression"),
	})),
}))

vi.mock("$lib/server/db", () => ({
	getDbOrThrow,
}))

vi.mock("$lib/server/config", async importOriginal => {
	const actual = await importOriginal<typeof import("$lib/server/config")>()

	return {
		...actual,
		resolveAllowReturnUrls,
	}
})

vi.mock("$lib/server/helpers", () => ({
	resolvePostAuthRedirect,
}))

vi.mock("$lib/server/session-exchange-code", () => ({
	appendSessionExchangeCodeToUrl,
	createSessionExchangeCode,
}))

vi.mock("$lib/server/session", () => ({
	removeSessionExchangeCodeFromUrl,
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
		resolveAllowReturnUrls.mockReturnValue([])
		resolvePostAuthRedirect.mockReturnValue(null)

		const result = await load({
			locals: {
				db: {} as never,
				user: null,
			},
			platform: {
				env: {},
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
		resolveAllowReturnUrls.mockReturnValue([])
		resolvePostAuthRedirect.mockReturnValue(null)

		const result = await load({
			locals: {
				db: {} as never,
				user: null,
			},
			platform: {
				env: {},
			},
			url: new URL("https://auth.example.com/"),
		} as never)

		expect(result).toMatchObject({
			canBootstrapAdmin: false,
		})
	})

	it("redirects an authenticated user to next without exposing the session token", async () => {
		resolveAllowReturnUrls.mockReturnValue([
			"https://dashboard.example.com/auth/callback",
		])
		resolvePostAuthRedirect.mockReturnValue(
			"https://dashboard.example.com/auth/callback?next=%2F"
		)
		removeSessionExchangeCodeFromUrl.mockReturnValue(
			"https://dashboard.example.com/auth/callback?next=%2F"
		)
		createSessionExchangeCode.mockResolvedValue({
			code: "exchange-code",
			expiresAt: "2026-04-22T09:28:00.000Z",
		})
		getDbOrThrow.mockReturnValue({})
		appendSessionExchangeCodeToUrl.mockReturnValue(
			"https://dashboard.example.com/auth/callback?next=%2F&simple_auth_code=exchange-code"
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
				platform: {
					env: {
						RETURN_URL_ALLOWLIST: "https://dashboard.example.com/auth/callback",
					},
				},
				url: new URL(
					"https://auth.example.com/?next=https%3A%2F%2Fdashboard.example.com%2Fauth%2Fcallback%3Fnext%3D%252F"
				),
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location:
				"https://dashboard.example.com/auth/callback?next=%2F&simple_auth_code=exchange-code",
		})

		expect(createSessionExchangeCode).toHaveBeenCalledWith(
			{},
			{
				returnUrl: "https://dashboard.example.com/auth/callback?next=%2F",
				token: "fresh-session-token",
			}
		)
		expect(appendSessionExchangeCodeToUrl).toHaveBeenCalledWith(
			"https://dashboard.example.com/auth/callback?next=%2F",
			"exchange-code"
		)
		expect(resolveAllowReturnUrls).toHaveBeenCalledWith({
			RETURN_URL_ALLOWLIST: "https://dashboard.example.com/auth/callback",
		})
	})
})
