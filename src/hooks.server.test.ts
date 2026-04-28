import { beforeEach, describe, expect, it, vi } from "vitest"

const {
	and,
	clearSessionCookie,
	createDb,
	eq,
	readSessionToken,
	resolveSessionCookieOptions,
	resolveSessionTokenAudience,
	resolveSessionTokenIssuer,
	setSessionCookie,
	signSessionToken,
	sql,
	verifySessionToken,
} = vi.hoisted(() => ({
	and: vi.fn(() => Symbol("and")),
	clearSessionCookie: vi.fn(),
	createDb: vi.fn(),
	eq: vi.fn(() => Symbol("eq")),
	readSessionToken: vi.fn(),
	resolveSessionCookieOptions: vi.fn(),
	resolveSessionTokenAudience: vi.fn(),
	resolveSessionTokenIssuer: vi.fn(),
	setSessionCookie: vi.fn(),
	signSessionToken: vi.fn(),
	sql: {
		raw: vi.fn(value => value),
	},
	verifySessionToken: vi.fn(),
}))

vi.mock("$lib/server/session", () => ({
	clearSessionCookie,
	readSessionToken,
	resolveSessionCookieOptions,
	resolveSessionTokenAudience,
	resolveSessionTokenIssuer,
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
		readSessionToken.mockReturnValue("legacy-auth-only-session")
		resolveSessionTokenIssuer.mockReturnValue("http://auth.ex.localhost:5100")
		resolveSessionTokenAudience.mockReturnValue("http://auth.ex.localhost:5100")
	})

	it("reissues the session cookie with the shared domain after a valid auth-only session", async () => {
		const cookies = {
			get: vi.fn(),
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
			"http://auth.ex.localhost:5100/?next=http%3A%2F%2Fdashboard.ex.localhost%3A4173%2F"
		)

		createDb.mockReturnValue(db)
		verifySessionToken.mockResolvedValue({
			aud: "http://auth.ex.localhost:5100",
			id: user.id,
			email: user.email,
			fullName: user.fullName,
			iss: "http://auth.ex.localhost:5100",
			jti: "session-id",
			role: "owner",
			roleName: "Owner",
			roles: [{ key: "owner", name: "Owner" }],
			sub: String(user.id),
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
						SESSION_PRIVATE_KEY_JWK: "private-session-key",
						SESSION_PUBLIC_KEY_JWK: "public-session-key",
					},
				},
				url,
			},
			resolve,
		} as never)

		expect(resolveSessionCookieOptions).toHaveBeenCalledWith(url, "localhost")
		expect(readSessionToken).toHaveBeenCalledWith(url, cookies)
		expect(verifySessionToken).toHaveBeenCalledWith(
			"legacy-auth-only-session",
			"public-session-key",
			{
				audience: "http://auth.ex.localhost:5100",
				issuer: "http://auth.ex.localhost:5100",
			}
		)
		expect(signSessionToken).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 7,
				email: "lead@example.com",
			}),
			"private-session-key",
			{
				audience: "http://auth.ex.localhost:5100",
				issuer: "http://auth.ex.localhost:5100",
			}
		)
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
