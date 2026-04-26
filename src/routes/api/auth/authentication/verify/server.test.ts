import { beforeEach, describe, expect, it, vi } from "vitest"

const {
	clearAuthenticationChallenge,
	createTimestamp,
	eq,
	expectedOrigin,
	expectedRpId,
	getAuthenticationChallenge,
	getDbOrThrow,
	normalizeEmail,
	resolvePostAuthRedirect,
	resolveSessionCookieOptions,
	setSessionCookie,
	shouldUseSecureCookies,
	signSessionToken,
	sql,
	verifyAuthenticationResponse,
} = vi.hoisted(() => ({
	clearAuthenticationChallenge: vi.fn(),
	createTimestamp: vi.fn(() => "2026-04-22T09:26:00.000Z"),
	eq: vi.fn(() => Symbol("eq")),
	expectedOrigin: vi.fn(),
	expectedRpId: vi.fn(),
	getAuthenticationChallenge: vi.fn(),
	getDbOrThrow: vi.fn(),
	normalizeEmail: vi.fn(),
	resolvePostAuthRedirect: vi.fn(),
	resolveSessionCookieOptions: vi.fn(),
	setSessionCookie: vi.fn(),
	shouldUseSecureCookies: vi.fn(),
	signSessionToken: vi.fn(),
	sql: vi.fn(() => "CURRENT_TIMESTAMP"),
	verifyAuthenticationResponse: vi.fn(),
}))

vi.mock("$lib/server/authentication-challenge", () => ({
	clearAuthenticationChallenge,
	getAuthenticationChallenge,
}))

vi.mock("$lib/server/db", () => ({
	getDbOrThrow,
}))

vi.mock("$lib/server/helpers", () => ({
	expectedOrigin,
	expectedRpId,
	normalizeEmail,
	resolvePostAuthRedirect,
}))

vi.mock("@simplewebauthn/server", () => ({
	verifyAuthenticationResponse,
}))

vi.mock("$lib/server/session", () => ({
	resolveSessionCookieOptions,
	setSessionCookie,
	shouldUseSecureCookies,
	signSessionToken,
}))

vi.mock("$lib/server/time", () => ({
	createTimestamp,
}))

vi.mock("drizzle-orm", () => ({
	asc: vi.fn(value => value),
	eq,
	inArray: vi.fn(() => Symbol("inArray")),
	sql,
}))

vi.mock("$lib/server/schema", () => ({
	passkeys: {
		id: "passkeys.id",
		userId: "passkeys.userId",
		publicKey: "passkeys.publicKey",
		counter: "passkeys.counter",
		transports: "passkeys.transports",
	},
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

import { POST } from "./+server"

describe("POST /api/auth/authentication/verify", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		getAuthenticationChallenge.mockReturnValue("challenge-1")
		normalizeEmail.mockReturnValue("lead@example.com")
		expectedOrigin.mockReturnValue("http://auth.ex.localhost:5100")
		expectedRpId.mockReturnValue("auth.ex.localhost")
		resolvePostAuthRedirect.mockReturnValue(
			"http://dashboard.ex.localhost:4173/"
		)
		verifyAuthenticationResponse.mockResolvedValue({
			verified: true,
			authenticationInfo: {
				newCounter: 9,
			},
		})
		resolveSessionCookieOptions.mockReturnValue({
			secure: false,
			domain: "localhost",
		})
		shouldUseSecureCookies.mockReturnValue(false)
		signSessionToken.mockResolvedValue({
			token: "signed-session-token",
			expiresAt: 123_456,
		})
	})

	it("writes the session cookie with shared cookie options", async () => {
		const passkeyRecord = {
			passkeyId: "passkey-1",
			publicKey: new Uint8Array([1, 2, 3]),
			counter: 4,
			transports: "[]",
			userId: 7,
			userEmail: "lead@example.com",
			userFullName: "Factory Lead",
			userIsActive: true,
		}
		const selectChain = {
			from: vi.fn().mockReturnThis(),
			innerJoin: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			get: vi.fn().mockResolvedValue(passkeyRecord),
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
		const updateWhere = vi.fn().mockResolvedValue(undefined)
		const updateChain = {
			set: vi.fn().mockReturnValue({
				where: updateWhere,
			}),
		}
		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce(selectChain)
				.mockReturnValueOnce(roleAssignmentsChain),
			update: vi.fn(() => updateChain),
		}
		const cookies = {}
		const request = new Request(
			"http://auth.ex.localhost:5100/api/auth/authentication/verify",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					email: "lead@example.com",
					credential: {
						id: "passkey-1",
					},
					next: "http://dashboard.ex.localhost:4173/",
				}),
			}
		)

		getDbOrThrow.mockReturnValue(db)

		const response = await POST({
			request,
			locals: {
				db: {} as never,
			},
			cookies: cookies as never,
			platform: {
				env: {
					ADMIN_ROLE_KEY: "owner",
					SESSION_COOKIE_DOMAIN: "localhost",
					SESSION_SECRET: "dev-session-secret",
				},
			},
		} as never)

		expect(resolveSessionCookieOptions).toHaveBeenCalledWith(
			request,
			"localhost"
		)
		expect(setSessionCookie).toHaveBeenCalledWith(
			cookies,
			"signed-session-token",
			123_456,
			{
				secure: false,
				domain: "localhost",
			}
		)
		await expect(response.json()).resolves.toMatchObject({
			redirectTo: "http://dashboard.ex.localhost:4173/",
		})
	})
})
