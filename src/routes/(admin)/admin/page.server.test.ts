import { beforeEach, describe, expect, it, vi } from "vitest"

const {
	createRegistrationInviteExpiry,
	createRegistrationInviteNonce,
	eq,
	getDbOrThrow,
	normalizeEmail,
	sql,
} = vi.hoisted(() => ({
	createRegistrationInviteExpiry: vi.fn(),
	createRegistrationInviteNonce: vi.fn(),
	eq: vi.fn(() => Symbol("eq")),
	getDbOrThrow: vi.fn(),
	normalizeEmail: vi.fn(),
	sql: vi.fn(() => "CURRENT_TIMESTAMP"),
}))

vi.mock("$lib/server/db", () => ({
	getDbOrThrow,
}))

vi.mock("$lib/server/helpers", () => ({
	normalizeEmail,
}))

vi.mock("$lib/server/registration-invite", () => ({
	createRegistrationInviteExpiry,
	createRegistrationInviteNonce,
}))

vi.mock("drizzle-orm", () => ({
	and: vi.fn(() => Symbol("and")),
	asc: vi.fn(value => value),
	desc: vi.fn(() => Symbol("desc")),
	eq,
	inArray: vi.fn(() => Symbol("inArray")),
	ne: vi.fn(() => Symbol("ne")),
	sql,
}))

vi.mock("$lib/server/schema", () => ({
	passkeys: {
		id: "passkeys.id",
		userId: "passkeys.userId",
	},
	roles: {
		key: "roles.key",
		name: "roles.name",
	},
	userRoles: {
		userId: "user_roles.user_id",
		roleKey: "user_roles.role_key",
	},
	registrationInvitations: {
		id: "registration_invitations.id",
		userId: "registration_invitations.userId",
		nonce: "registration_invitations.nonce",
		expiresAt: "registration_invitations.expiresAt",
		issuedBy: "registration_invitations.issuedBy",
		updatedAt: "registration_invitations.updatedAt",
	},
	users: {
		id: "users.id",
		email: "users.email",
		fullName: "users.fullName",
		isActive: "users.isActive",
		approvedAt: "users.approvedAt",
		approvedBy: "users.approvedBy",
		registrationChallenge: "users.registrationChallenge",
		authenticationChallenge: "users.authenticationChallenge",
		webauthnUserId: "users.webauthnUserId",
		lastLoginAt: "users.lastLoginAt",
		updatedAt: "users.updatedAt",
		createdAt: "users.createdAt",
	},
}))

import { actions } from "./+page.server"

describe("/admin page actions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		normalizeEmail.mockImplementation(value => value.trim().toLowerCase())
		createRegistrationInviteNonce.mockReturnValue("invite-nonce")
		createRegistrationInviteExpiry.mockReturnValue("2026-04-29T00:00:00.000Z")
	})

	it("creates a user and returns a registration link", async () => {
		const insertGet = vi.fn().mockResolvedValue({
			id: 12,
			email: "new.user@example.com",
		})
		const selectGet = vi
			.fn()
			.mockResolvedValueOnce({
				key: "user",
				name: "User",
				isSystem: true,
			})
			.mockResolvedValueOnce(undefined)
		const db = {
			select: vi.fn(() => ({
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				get: selectGet,
			})),
			delete: vi.fn(() => ({
				where: vi.fn().mockResolvedValue(undefined),
			})),
			insert: vi.fn(() => ({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockReturnValue({
						get: insertGet,
					}),
				}),
			})),
		}
		getDbOrThrow.mockReturnValue(db)

		const request = new Request("https://auth.example.com/admin", {
			method: "POST",
			body: new URLSearchParams({
				fullName: "New User",
				email: "NEW.USER@example.com ",
				role: "user",
			}),
		})

		const result = await actions.createUserInvite({
			request,
			locals: {
				db: {} as never,
				user: {
					id: 1,
					role: "owner",
					roles: [{ key: "owner", name: "Owner" }],
				},
			},
			url: new URL("https://auth.example.com/admin"),
		} as never)

		expect(db.insert).toHaveBeenCalled()
		expect(result).toMatchObject({
			message: "User created and registration link generated",
			registrationLink:
				"https://auth.example.com/register?invite_nonce=invite-nonce&email=new.user%40example.com",
		})
	})

	it("rejects duplicate emails", async () => {
		const selectGet = vi
			.fn()
			.mockResolvedValueOnce({
				key: "user",
				name: "User",
				isSystem: true,
			})
			.mockResolvedValueOnce({ id: 44 })
		const db = {
			select: vi.fn(() => ({
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				get: selectGet,
			})),
		}
		getDbOrThrow.mockReturnValue(db)

		const result = (await actions.createUserInvite({
			request: new Request("https://auth.example.com/admin", {
				method: "POST",
				body: new URLSearchParams({
					fullName: "New User",
					email: "existing@example.com",
					role: "user",
				}),
			}),
			locals: {
				db: {} as never,
				user: {
					id: 1,
					role: "owner",
					roles: [{ key: "owner", name: "Owner" }],
				},
			},
		} as never)) as { status: number }

		expect(result.status).toBe(409)
	})
})
