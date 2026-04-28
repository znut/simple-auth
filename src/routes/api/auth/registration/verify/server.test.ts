import { beforeEach, describe, expect, it, vi } from "vitest"

const {
	appendSessionExchangeCodeToUrl,
	createSessionExchangeCode,
	createTimestamp,
	eq,
	expectedOrigin,
	expectedRpId,
	getDbOrThrow,
	normalizeEmail,
	removeSessionExchangeCodeFromUrl,
	resolveAllowReturnUrls,
	resolvePostAuthRedirect,
	resolveRegistrationInvite,
	resolveSessionPrivateKey,
	resolveSessionCookieOptions,
	resolveSessionTokenAudience,
	resolveSessionTokenIssuer,
	setSessionCookie,
	signSessionToken,
	verifyRegistrationResponse,
} = vi.hoisted(() => ({
	appendSessionExchangeCodeToUrl: vi.fn(),
	createSessionExchangeCode: vi.fn(),
	createTimestamp: vi.fn(() => "2026-04-22T09:26:00.000Z"),
	eq: vi.fn(() => Symbol("eq")),
	expectedOrigin: vi.fn(),
	expectedRpId: vi.fn(),
	getDbOrThrow: vi.fn(),
	normalizeEmail: vi.fn(),
	removeSessionExchangeCodeFromUrl: vi.fn(),
	resolveAllowReturnUrls: vi.fn(),
	resolvePostAuthRedirect: vi.fn(),
	resolveRegistrationInvite: vi.fn(),
	resolveSessionPrivateKey: vi.fn(),
	resolveSessionCookieOptions: vi.fn(),
	resolveSessionTokenAudience: vi.fn(),
	resolveSessionTokenIssuer: vi.fn(),
	setSessionCookie: vi.fn(),
	signSessionToken: vi.fn(),
	verifyRegistrationResponse: vi.fn(),
}))

vi.mock("$lib/server/db", () => ({
	getDbOrThrow,
}))

vi.mock("$lib/server/config", () => ({
	resolveAllowReturnUrls,
}))

vi.mock("$lib/server/helpers", () => ({
	expectedOrigin,
	expectedRpId,
	normalizeEmail,
	resolvePostAuthRedirect,
}))

vi.mock("$lib/server/registration-invite", () => ({
	resolveRegistrationInvite,
}))

vi.mock("@simplewebauthn/server", () => ({
	verifyRegistrationResponse,
}))

vi.mock("$lib/server/session", () => ({
	removeSessionExchangeCodeFromUrl,
	resolveSessionCookieOptions,
	resolveSessionTokenAudience,
	resolveSessionTokenIssuer,
	setSessionCookie,
	signSessionToken,
}))

vi.mock("$lib/server/roles", async importOriginal => {
	const actual = await importOriginal<typeof import("$lib/server/roles")>()

	return {
		...actual,
		resolveSessionPrivateKey,
	}
})

vi.mock("$lib/server/session-exchange-code", () => ({
	appendSessionExchangeCodeToUrl,
	createSessionExchangeCode,
}))

vi.mock("$lib/server/time", () => ({
	createTimestamp,
}))

vi.mock("drizzle-orm", () => ({
	asc: vi.fn(value => value),
	eq,
	inArray: vi.fn(() => Symbol("inArray")),
}))

vi.mock("$lib/server/schema", () => ({
	passkeys: {
		id: "passkeys.id",
		userId: "passkeys.userId",
	},
	registrationInvitations: {
		userId: "registration_invitations.user_id",
	},
	users: {
		id: "users.id",
		email: "users.email",
		fullName: "users.fullName",
		isActive: "users.isActive",
		registrationChallenge: "users.registrationChallenge",
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

describe("POST /api/auth/registration/verify", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		normalizeEmail.mockReturnValue("lead@example.com")
		resolveRegistrationInvite.mockReturnValue(null)
		expectedOrigin.mockReturnValue("http://auth.ex.localhost:5100")
		expectedRpId.mockReturnValue("auth.ex.localhost")
		resolveAllowReturnUrls.mockReturnValue([
			"http://dashboard.ex.localhost:4173/auth/callback",
		])
		resolvePostAuthRedirect.mockReturnValue(
			"http://dashboard.ex.localhost:4173/"
		)
		resolveSessionPrivateKey.mockReturnValue("private-session-key")
		resolveSessionTokenIssuer.mockReturnValue("http://auth.ex.localhost:5100")
		resolveSessionTokenAudience.mockReturnValue("http://auth.ex.localhost:5100")
		removeSessionExchangeCodeFromUrl.mockReturnValue(
			"http://dashboard.ex.localhost:4173/"
		)
		verifyRegistrationResponse.mockResolvedValue({
			verified: true,
			registrationInfo: {
				credential: {
					id: "passkey-1",
					publicKey: new Uint8Array([1, 2, 3]),
					counter: 4,
				},
				credentialDeviceType: "singleDevice",
				credentialBackedUp: false,
			},
		})
		resolveSessionCookieOptions.mockReturnValue({
			secure: false,
			domain: "localhost",
		})
		signSessionToken
			.mockResolvedValueOnce({
				token: "auth-session-token",
				expiresAt: 123_456,
			})
			.mockResolvedValueOnce({
				token: "consumer-session-token",
				expiresAt: 123_456,
			})
		createSessionExchangeCode.mockResolvedValue({
			code: "exchange-code",
			expiresAt: "2026-04-22T09:28:00.000Z",
		})
		appendSessionExchangeCodeToUrl.mockReturnValue(
			"http://dashboard.ex.localhost:4173/?simple_auth_code=exchange-code"
		)
	})

	it("returns the post-registration redirect url with an exchange code", async () => {
		const user = {
			id: 7,
			email: "lead@example.com",
			fullName: "Factory Lead",
			isActive: true,
			registrationChallenge: "challenge-1",
		}
		const existingPasskeySelect = {
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			get: vi.fn().mockResolvedValue(undefined),
		}
		const userSelect = {
			from: vi.fn().mockReturnThis(),
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
			select: vi
				.fn()
				.mockReturnValueOnce(userSelect)
				.mockReturnValueOnce(existingPasskeySelect)
				.mockReturnValueOnce(roleAssignmentsChain),
			insert: vi.fn(() => ({
				values: vi.fn().mockResolvedValue(undefined),
			})),
			update: vi.fn(() => ({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(undefined),
				}),
			})),
		}
		getDbOrThrow.mockReturnValue(db)

		const cookies = {}
		const response = await POST({
			request: new Request(
				"http://auth.ex.localhost:5100/api/auth/registration/verify",
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						email: "lead@example.com",
						credential: {
							id: "passkey-1",
							transports: [],
						},
						next: "http://dashboard.ex.localhost:4173/",
					}),
				}
			),
			locals: {
				db: {} as never,
			},
			cookies: cookies as never,
			platform: {
				env: {
					ADMIN_ROLE_KEY: "owner",
					RETURN_URL_ALLOWLIST:
						"http://dashboard.ex.localhost:4173/auth/callback",
					SESSION_COOKIE_DOMAIN: "localhost",
					SESSION_PRIVATE_KEY_JWK: "private-session-key",
				},
			},
		} as never)

		expect(setSessionCookie).toHaveBeenCalledWith(
			cookies,
			"auth-session-token",
			123_456,
			{
				secure: false,
				domain: "localhost",
			}
		)
		expect(resolveAllowReturnUrls).toHaveBeenCalledWith({
			ADMIN_ROLE_KEY: "owner",
			RETURN_URL_ALLOWLIST: "http://dashboard.ex.localhost:4173/auth/callback",
			SESSION_COOKIE_DOMAIN: "localhost",
			SESSION_PRIVATE_KEY_JWK: "private-session-key",
		})
		expect(signSessionToken).toHaveBeenNthCalledWith(
			1,
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
		expect(signSessionToken).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				id: 7,
				email: "lead@example.com",
			}),
			"private-session-key",
			{
				audience: "http://dashboard.ex.localhost:4173",
				issuer: "http://auth.ex.localhost:5100",
			}
		)
		expect(createSessionExchangeCode).toHaveBeenCalledWith(db, {
			returnUrl: "http://dashboard.ex.localhost:4173/",
			token: "consumer-session-token",
		})
		expect(appendSessionExchangeCodeToUrl).toHaveBeenCalledWith(
			"http://dashboard.ex.localhost:4173/",
			"exchange-code"
		)
		await expect(response.json()).resolves.toMatchObject({
			redirectTo:
				"http://dashboard.ex.localhost:4173/?simple_auth_code=exchange-code",
		})
	})
})
