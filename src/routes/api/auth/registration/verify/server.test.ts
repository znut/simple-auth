import { beforeEach, describe, expect, it, vi } from "vitest"

const {
	appendSessionTokenToUrl,
	createTimestamp,
	eq,
	expectedOrigin,
	expectedRpId,
	getDbOrThrow,
	normalizeEmail,
	resolvePostAuthRedirect,
	resolveRegistrationInvite,
	resolveSessionCookieOptions,
	setSessionCookie,
	signSessionToken,
	verifyRegistrationResponse,
} = vi.hoisted(() => ({
	appendSessionTokenToUrl: vi.fn(),
	createTimestamp: vi.fn(() => "2026-04-22T09:26:00.000Z"),
	eq: vi.fn(() => Symbol("eq")),
	expectedOrigin: vi.fn(),
	expectedRpId: vi.fn(),
	getDbOrThrow: vi.fn(),
	normalizeEmail: vi.fn(),
	resolvePostAuthRedirect: vi.fn(),
	resolveRegistrationInvite: vi.fn(),
	resolveSessionCookieOptions: vi.fn(),
	setSessionCookie: vi.fn(),
	signSessionToken: vi.fn(),
	verifyRegistrationResponse: vi.fn(),
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

vi.mock("$lib/server/registration-invite", () => ({
	resolveRegistrationInvite,
}))

vi.mock("@simplewebauthn/server", () => ({
	verifyRegistrationResponse,
}))

vi.mock("$lib/server/session", () => ({
	appendSessionTokenToUrl,
	resolveSessionCookieOptions,
	setSessionCookie,
	signSessionToken,
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
		resolvePostAuthRedirect.mockReturnValue(
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
		signSessionToken.mockResolvedValue({
			token: "signed-session-token",
			expiresAt: 123_456,
		})
		appendSessionTokenToUrl.mockImplementation(
			(url: string, token: string) => `${url}?simple_auth_token=${token}`
		)
	})

	it("returns the session token in the post-registration redirect url", async () => {
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
					SESSION_COOKIE_DOMAIN: "localhost",
					SESSION_SECRET: "dev-session-secret",
				},
			},
		} as never)

		expect(setSessionCookie).toHaveBeenCalledWith(
			cookies,
			"signed-session-token",
			123_456,
			{
				secure: false,
				domain: "localhost",
			}
		)
		expect(appendSessionTokenToUrl).toHaveBeenCalledWith(
			"http://dashboard.ex.localhost:4173/",
			"signed-session-token"
		)
		await expect(response.json()).resolves.toMatchObject({
			redirectTo:
				"http://dashboard.ex.localhost:4173/?simple_auth_token=signed-session-token",
		})
	})
})
