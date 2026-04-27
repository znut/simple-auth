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
	sql: vi.fn(() => ({
		mapWith: vi.fn(() => "CURRENT_TIMESTAMP"),
	})),
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

	it("allows the active user to add another role while keeping owner", async () => {
		const params = new URLSearchParams()
		params.set("userId", "1")
		params.set("fullName", "Owner User")
		params.append("roleKeys", "owner")
		params.append("roleKeys", "user")

		const getQueue = [
			{
				key: "owner",
				name: "Owner",
				description: "Full access",
				isSystem: true,
			},
			{
				key: "user",
				name: "User",
				description: "Standard access",
				isSystem: true,
			},
			{
				id: 1,
				email: "owner@example.com",
				fullName: "Owner User",
				isActive: true,
				approvedBy: 2,
				approvedAt: "2026-04-27T00:00:00.000Z",
			},
		]
		const orderByQueue = [[{ userId: 1, roleKey: "owner", roleName: "Owner" }]]
		const updateWhere = vi.fn().mockResolvedValue(undefined)
		const updateSet = vi.fn(() => ({
			where: updateWhere,
		}))
		const insertValues = vi.fn().mockResolvedValue(undefined)
		const deleteWhere = vi.fn().mockResolvedValue(undefined)
		const db = {
			select: vi.fn(() => ({
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn(() => Promise.resolve(orderByQueue.shift())),
				get: vi.fn(() => Promise.resolve(getQueue.shift())),
			})),
			update: vi.fn(() => ({
				set: updateSet,
			})),
			delete: vi.fn(() => ({
				where: deleteWhere,
			})),
			insert: vi.fn(() => ({
				values: insertValues,
			})),
		}
		getDbOrThrow.mockReturnValue(db)

		const result = await actions.updateUser({
			request: new Request("https://auth.example.com/admin", {
				method: "POST",
				body: params,
			}),
			locals: {
				db: {} as never,
				user: {
					id: 1,
					role: "owner",
					roles: [{ key: "owner", name: "Owner" }],
				},
			},
		} as never)

		expect(result).toEqual({ message: "User updated" })
		expect(db.update).toHaveBeenCalled()
		expect(insertValues).toHaveBeenCalledWith([
			{ userId: 1, roleKey: "owner" },
			{ userId: 1, roleKey: "user" },
		])
	})

	it("blocks the active user from removing owner from themselves", async () => {
		const params = new URLSearchParams()
		params.set("userId", "1")
		params.set("fullName", "Owner User")
		params.append("roleKeys", "user")

		const getQueue = [
			{
				key: "user",
				name: "User",
				description: "Standard access",
				isSystem: true,
			},
			{
				id: 1,
				email: "owner@example.com",
				fullName: "Owner User",
				isActive: true,
				approvedBy: 2,
				approvedAt: "2026-04-27T00:00:00.000Z",
			},
			{ count: 1 },
		]
		const orderByQueue = [[{ userId: 1, roleKey: "owner", roleName: "Owner" }]]
		const db = {
			select: vi.fn(() => ({
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn(() => Promise.resolve(orderByQueue.shift())),
				get: vi.fn(() => Promise.resolve(getQueue.shift())),
			})),
			update: vi.fn(() => ({
				set: vi.fn(() => ({
					where: vi.fn().mockResolvedValue(undefined),
				})),
			})),
			delete: vi.fn(() => ({
				where: vi.fn().mockResolvedValue(undefined),
			})),
			insert: vi.fn(() => ({
				values: vi.fn().mockResolvedValue(undefined),
			})),
		}
		getDbOrThrow.mockReturnValue(db)

		const result = (await actions.updateUser({
			request: new Request("https://auth.example.com/admin", {
				method: "POST",
				body: params,
			}),
			locals: {
				db: {} as never,
				user: {
					id: 1,
					role: "owner",
					roles: [{ key: "owner", name: "Owner" }],
				},
			},
		} as never)) as { status: number; data: { message: string } }

		expect(result.status).toBe(400)
		expect(result.data.message).toBe(
			"You cannot remove the owner role from your active session."
		)
		expect(db.update).not.toHaveBeenCalled()
	})
})
