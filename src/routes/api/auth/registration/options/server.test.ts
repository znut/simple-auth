import { beforeEach, describe, expect, it, vi } from "vitest"

const {
	eq,
	expectedRpId,
	generateRegistrationOptions,
	getDbOrThrow,
	resolveRegistrationInvite,
	sql,
} = vi.hoisted(() => ({
	eq: vi.fn(() => Symbol("eq")),
	expectedRpId: vi.fn(),
	generateRegistrationOptions: vi.fn(),
	getDbOrThrow: vi.fn(),
	resolveRegistrationInvite: vi.fn(),
	sql: vi.fn(() => ({
		mapWith: vi.fn(() => "count-expression"),
	})),
}))

vi.mock("$lib/server/db", () => ({
	getDbOrThrow,
}))

vi.mock("$lib/server/helpers", () => ({
	expectedRpId,
	normalizeEmail: vi.fn(value => value),
}))

vi.mock("$lib/server/registration-invite", () => ({
	resolveRegistrationInvite,
}))

vi.mock("@simplewebauthn/server", () => ({
	generateRegistrationOptions,
}))

vi.mock("drizzle-orm", () => ({
	and: vi.fn(() => Symbol("and")),
	eq,
	sql,
}))

vi.mock("$lib/server/schema", () => ({
	users: {
		id: "users.id",
		email: "users.email",
		fullName: "users.fullName",
		isActive: "users.isActive",
		registrationChallenge: "users.registrationChallenge",
		webauthnUserId: "users.webauthnUserId",
		updatedAt: "users.updatedAt",
	},
	userRoles: {
		userId: "user_roles.user_id",
		roleKey: "user_roles.role_key",
	},
}))

import { POST } from "./+server"

describe("POST /api/auth/registration/options", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		expectedRpId.mockReturnValue("auth.example.com")
		generateRegistrationOptions.mockResolvedValue({
			challenge: "challenge-1",
			user: {
				id: "user-id",
			},
		})
	})

	it("resolves invite registrations from nonce and email instead of client identity", async () => {
		const updateWhere = vi.fn().mockResolvedValue(undefined)
		const db = {
			update: vi.fn(() => ({
				set: vi.fn().mockReturnValue({
					where: updateWhere,
				}),
			})),
		}
		getDbOrThrow.mockReturnValue(db)
		resolveRegistrationInvite.mockResolvedValue({
			ok: true,
			user: {
				id: 7,
				email: "invited@example.com",
				fullName: "Invited User",
			},
		})

		const response = await POST({
			request: new Request(
				"https://auth.example.com/api/auth/registration/options",
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						inviteNonce: "invite-nonce",
						email: "invited@example.com",
						fullName: "Spoofed Name",
					}),
				}
			),
			locals: {
				db: {} as never,
			},
			platform: {
				env: {
					ADMIN_ROLE_KEY: "owner",
				},
			},
		} as never)

		expect(resolveRegistrationInvite).toHaveBeenCalledWith(
			db,
			"invited@example.com",
			"invite-nonce"
		)
		expect(generateRegistrationOptions).toHaveBeenCalledWith(
			expect.objectContaining({
				userName: "invited@example.com",
				userDisplayName: "Invited User",
			})
		)
		await expect(response.json()).resolves.toMatchObject({
			challenge: "challenge-1",
		})
	})

	it("rejects invalid invite links", async () => {
		getDbOrThrow.mockReturnValue({})
		resolveRegistrationInvite.mockResolvedValue({
			ok: false,
			message: "This registration link is invalid or has expired.",
		})

		const response = await POST({
			request: new Request(
				"https://auth.example.com/api/auth/registration/options",
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						inviteNonce: "bad-nonce",
						email: "invited@example.com",
					}),
				}
			),
			locals: {
				db: {} as never,
			},
			platform: {
				env: {
					ADMIN_ROLE_KEY: "owner",
				},
			},
		} as never)

		expect(response.status).toBe(400)
		await expect(response.json()).resolves.toMatchObject({
			message: "This registration link is invalid or has expired.",
		})
	})

	it("creates bootstrap registration options when no users exist", async () => {
		const insertValues = vi.fn().mockResolvedValue(undefined)
		const selectGet = vi
			.fn()
			.mockResolvedValueOnce({ count: 0 })
			.mockResolvedValueOnce({ id: 1 })
		const db = {
			select: vi.fn(() => ({
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				get: selectGet,
			})),
			insert: vi.fn(() => ({
				values: insertValues,
			})),
		}
		getDbOrThrow.mockReturnValue(db)

		const response = await POST({
			request: new Request(
				"https://auth.example.com/api/auth/registration/options",
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						email: "first.owner@example.com",
						fullName: "First Admin",
					}),
				}
			),
			locals: {
				db: {} as never,
			},
			platform: {
				env: {
					ADMIN_ROLE_KEY: "owner",
				},
			},
		} as never)

		expect(generateRegistrationOptions).toHaveBeenCalledWith(
			expect.objectContaining({
				userName: "first.owner@example.com",
				userDisplayName: "First Admin",
			})
		)
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				email: "first.owner@example.com",
				fullName: "First Admin",
				isActive: true,
			})
		)
		await expect(response.json()).resolves.toMatchObject({
			challenge: "challenge-1",
		})
	})

	it("rejects public registration after any user exists", async () => {
		const db = {
			select: vi.fn(() => ({
				from: vi.fn().mockReturnThis(),
				get: vi.fn().mockResolvedValue({ count: 1 }),
			})),
		}
		getDbOrThrow.mockReturnValue(db)

		const response = await POST({
			request: new Request(
				"https://auth.example.com/api/auth/registration/options",
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						email: "later.user@example.com",
						fullName: "Later User",
					}),
				}
			),
			locals: {
				db: {} as never,
			},
			platform: {
				env: {
					ADMIN_ROLE_KEY: "owner",
				},
			},
		} as never)

		expect(response.status).toBe(403)
		expect(generateRegistrationOptions).not.toHaveBeenCalled()
		await expect(response.json()).resolves.toMatchObject({
			message:
				"Public registration is closed. Ask an admin to create an invitation.",
		})
	})
})
