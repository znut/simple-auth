import { beforeEach, describe, expect, it, vi } from "vitest"

const {
	and,
	clearSessionCookie,
	createDb,
	eq,
	resolveSessionCookieOptions,
	setSessionCookie,
	signSessionToken,
	sql,
	verifySessionToken,
} = vi.hoisted(() => ({
	and: vi.fn(() => Symbol("and")),
	clearSessionCookie: vi.fn(),
	createDb: vi.fn(),
	eq: vi.fn(() => Symbol("eq")),
	resolveSessionCookieOptions: vi.fn(),
	setSessionCookie: vi.fn(),
	signSessionToken: vi.fn(),
	sql: {
		raw: vi.fn(value => value),
	},
	verifySessionToken: vi.fn(),
}))

vi.mock("$lib/server/session", () => ({
	clearSessionCookie,
	resolveSessionCookieOptions,
	sessionCookieName: "simple_auth_session",
	setSessionCookie,
	signSessionToken,
	verifySessionToken,
}))

vi.mock("$lib/server/db", () => ({
	createDb,
}))

vi.mock("drizzle-orm", () => ({
	and,
	asc: vi.fn(value => value),
	eq,
	inArray: vi.fn(() => Symbol("inArray")),
	sql,
}))

vi.mock("$lib/server/schema", () => ({
	users: {
		id: "users.id",
		email: "users.email",
		fullName: "users.fullName",
		isActive: "users.isActive",
	},
	userRoles: {
		userId: "user_roles.user_id",
		roleKey: "user_roles.role_key",
	},
	roles: {
		key: "roles.key",
		name: "roles.name",
	},
}))

import { handle } from "./hooks.server"

describe("auth session hook", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resolveSessionCookieOptions.mockReturnValue({
			secure: false,
			domain: "localhost",
		})
	})

	it("reissues the session cookie with the shared domain after a valid auth-only session", async () => {
		const sessionToken = "legacy-auth-only-session"
		const cookies = {
			get: vi.fn(() => sessionToken),
		}
		const user = {
			id: 7,
			email: "lead@example.com",
			fullName: "Factory Lead",
			isActive: true,
		}
		const selectChain = {
			from: vi.fn().mockReturnThis(),
			innerJoin: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			get: vi.fn().mockResolvedValue(user),
		}
		const roleAssignmentsChain = {
			from: vi.fn().mockReturnThis(),
			innerJoin: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			orderBy: vi.fn().mockResolvedValue([
				{
					userId: 7,
					roleKey: "owner",
					roleName: "Owner",
				},
			]),
		}
		const db = {
			run: vi.fn().mockResolvedValue(undefined),
			select: vi
				.fn()
				.mockReturnValueOnce(selectChain)
				.mockReturnValueOnce(roleAssignmentsChain),
		}
		const resolve = vi.fn(
			async event => new Response(JSON.stringify(event.locals.user))
		)
		const url = new URL(
			"http://auth.ex.localhost:4174/?next=http%3A%2F%2Fdashboard.ex.localhost%3A4173%2F"
		)

		createDb.mockReturnValue(db)
		verifySessionToken.mockResolvedValue({
			id: user.id,
			email: user.email,
			fullName: user.fullName,
			role: "owner",
			roleName: "Owner",
			roles: [{ key: "owner", name: "Owner" }],
			exp: 123_456,
			iat: 123_000,
		})
		signSessionToken.mockResolvedValue({
			token: "fresh-session-token",
			expiresAt: 234_567,
		})

		const response = await handle({
			event: {
				cookies,
				locals: {
					user: null,
				},
				platform: {
					env: {
						DB: {} as never,
						SESSION_COOKIE_DOMAIN: "localhost",
						SESSION_SECRET: "dev-session-secret",
					},
				},
				url,
			},
			resolve,
		} as never)

		expect(resolveSessionCookieOptions).toHaveBeenCalledWith(url, "localhost")
		expect(setSessionCookie).toHaveBeenCalledWith(
			cookies,
			"fresh-session-token",
			234_567,
			{
				secure: false,
				domain: "localhost",
			}
		)
		expect(clearSessionCookie).not.toHaveBeenCalled()
		await expect(response.json()).resolves.toMatchObject({
			id: 7,
			email: "lead@example.com",
			fullName: "Factory Lead",
			role: "owner",
			roleName: "Owner",
			roles: [{ key: "owner", name: "Owner" }],
			isActive: true,
		})
	})
})
