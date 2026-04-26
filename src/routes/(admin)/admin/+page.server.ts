import { config } from "$lib/server/config"
import { getDbOrThrow } from "$lib/server/db"
import { normalizeEmail } from "$lib/server/helpers"
import {
	createRegistrationInviteExpiry,
	createRegistrationInviteNonce,
} from "$lib/server/registration-invite"
import {
	canAccessAdmin,
	countOtherActiveAdminUsers,
	getRoleByKey,
	listRoles,
	listUserRoles,
	normalizeRoleKeys,
	replaceUserRoles,
	resolvePrimarySessionRole,
	rolesHaveAdminAccess,
} from "$lib/server/roles"
import {
	passkeys,
	registrationInvitations,
	userRoles,
	users,
} from "$lib/server/schema"
import { createTimestamp } from "$lib/server/time"
import { fail } from "@sveltejs/kit"
import { desc, eq } from "drizzle-orm"
import type { Actions, PageServerLoad } from "./$types"

function parseUserId(value: FormDataEntryValue | null) {
	const userId = Number(value)

	if (!Number.isInteger(userId) || userId <= 0) {
		return null
	}

	return userId
}

function parseIsActive(value: FormDataEntryValue | null) {
	if (value === "true") {
		return true
	}

	if (value === "false") {
		return false
	}

	return null
}

function getSubmittedRoleKeys(formData: FormData) {
	return normalizeRoleKeys([
		...formData.getAll("roleKeys").map(value => String(value)),
		String(formData.get("role") ?? ""),
	])
}

function requireAdmin(locals: App.Locals, adminRoleKey: string) {
	if (!canAccessAdmin(locals.user, adminRoleKey)) {
		return fail(403, { message: "Only admin-role users can manage users" })
	}

	return null
}

async function getManagedUser(
	db: ReturnType<typeof getDbOrThrow>,
	userId: number,
	adminRoleKey: string
) {
	const managedUser = await db
		.select({
			id: users.id,
			email: users.email,
			fullName: users.fullName,
			isActive: users.isActive,
			approvedBy: users.approvedBy,
			approvedAt: users.approvedAt,
		})
		.from(users)
		.where(eq(users.id, userId))
		.get()

	if (!managedUser) {
		return undefined
	}

	const assignedRoles =
		(await listUserRoles(db, [managedUser.id])).get(managedUser.id) ?? []
	const sessionRoles = assignedRoles.map(({ key, name }) => ({ key, name }))
	const primaryRole = resolvePrimarySessionRole(sessionRoles)

	if (!primaryRole) {
		return undefined
	}

	return {
		...managedUser,
		role: primaryRole.key,
		roleName: primaryRole.name,
		roles: sessionRoles,
		canAccessAdmin: rolesHaveAdminAccess(
			sessionRoles.map(role => role.key),
			adminRoleKey
		),
	}
}

async function getUserPasskey(
	db: ReturnType<typeof getDbOrThrow>,
	userId: number
) {
	return db
		.select({ id: passkeys.id })
		.from(passkeys)
		.where(eq(passkeys.userId, userId))
		.get()
}

async function replaceRegistrationInvitation(
	db: ReturnType<typeof getDbOrThrow>,
	userId: number,
	inviteNonce: string,
	inviteExpiresAt: string,
	issuedBy: number
) {
	await db
		.delete(registrationInvitations)
		.where(eq(registrationInvitations.userId, userId))

	await db.insert(registrationInvitations).values({
		userId,
		nonce: inviteNonce,
		expiresAt: inviteExpiresAt,
		issuedBy,
		updatedAt: createTimestamp(),
	})
}

async function ensureAdminCoverage(
	db: ReturnType<typeof getDbOrThrow>,
	adminRoleKey: string,
	userId: number,
	nextState?: {
		canAccessAdmin?: boolean
		isActive?: boolean
	}
) {
	const currentUser = await getManagedUser(db, userId, adminRoleKey)

	if (!currentUser) {
		return {
			error: fail(404, { message: "The selected user was not found" }),
		}
	}

	const currentIsEnabledApprovedAdmin =
		currentUser.canAccessAdmin && currentUser.isActive

	const nextIsEnabledApprovedAdmin =
		(nextState?.canAccessAdmin ?? currentUser.canAccessAdmin) &&
		(nextState?.isActive ?? currentUser.isActive)

	if (
		currentIsEnabledApprovedAdmin &&
		!nextIsEnabledApprovedAdmin &&
		(await countOtherActiveAdminUsers(db, adminRoleKey, userId)) === 0
	) {
		return {
			error: fail(400, {
				message: "At least one enabled admin-role account must remain.",
			}),
		}
	}

	return { currentUser }
}

export const load: PageServerLoad = async ({ locals }) => {
	const db = getDbOrThrow(locals.db)
	const adminRoleKey = config.ownerRole
	const [managedUsers, availableRoles] = await Promise.all([
		db
			.select({
				id: users.id,
				email: users.email,
				fullName: users.fullName,
				isActive: users.isActive,
				createdAt: users.createdAt,
				lastLoginAt: users.lastLoginAt,
			})
			.from(users)
			.orderBy(desc(users.createdAt)),
		listRoles(db),
	])
	const roleAssignments = await listUserRoles(
		db,
		managedUsers.map(user => user.id)
	)

	return {
		currentUserId: locals.user?.id ?? null,
		managedUsers: managedUsers.flatMap(user => {
			const assignedRoles = roleAssignments.get(user.id) ?? []
			const sessionRoles = assignedRoles.map(({ key, name }) => ({ key, name }))
			const primaryRole = resolvePrimarySessionRole(sessionRoles)

			if (!primaryRole) {
				return []
			}

			return [
				{
					...user,
					role: primaryRole.key,
					roleName: primaryRole.name,
					roles: sessionRoles,
					canAccessAdmin: rolesHaveAdminAccess(
						sessionRoles.map(role => role.key),
						adminRoleKey
					),
				},
			]
		}),
		availableRoles,
	}
}

export const actions: Actions = {
	createUserInvite: async ({ request, locals, url }) => {
		const adminRoleKey = config.ownerRole
		const accessError = requireAdmin(locals, adminRoleKey)

		if (accessError) {
			return accessError
		}

		const db = getDbOrThrow(locals.db)
		const formData = await request.formData()
		const fullName = String(formData.get("fullName") ?? "").trim()
		const email = normalizeEmail(String(formData.get("email") ?? ""))
		const selectedRoleKeys = getSubmittedRoleKeys(formData)

		if (!fullName || !email) {
			return fail(400, { message: "Full name and Email are required" })
		}

		if (selectedRoleKeys.length === 0) {
			return fail(400, { message: "At least one role is required" })
		}

		const selectedRoles = (
			await Promise.all(
				selectedRoleKeys.map(roleKey => getRoleByKey(db, roleKey))
			)
		).filter(Boolean)

		if (selectedRoles.length !== selectedRoleKeys.length) {
			return fail(400, { message: "A valid role is required" })
		}

		const existingUser = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, email))
			.get()

		if (existingUser) {
			return fail(409, {
				message: "Another user is already using that Email.",
			})
		}

		const inviteNonce = createRegistrationInviteNonce()
		const inviteExpiresAt = createRegistrationInviteExpiry()
		const createdUser = await db
			.insert(users)
			.values({
				email,
				fullName,
				isActive: true,
				approvedAt: createTimestamp(),
				approvedBy: locals.user!.id,
				registrationChallenge: null,
				authenticationChallenge: null,
				webauthnUserId: null,
				lastLoginAt: null,
			})
			.returning({
				id: users.id,
				email: users.email,
			})
			.get()

		await db.insert(userRoles).values(
			selectedRoleKeys.map(roleKey => ({
				userId: createdUser.id,
				roleKey,
			}))
		)

		await replaceRegistrationInvitation(
			db,
			createdUser.id,
			inviteNonce,
			inviteExpiresAt,
			locals.user!.id
		)

		return {
			message: "User created and registration link generated",
			registrationLink: new URL(
				`/register?invite_nonce=${encodeURIComponent(inviteNonce)}&email=${encodeURIComponent(createdUser.email)}`,
				url
			).toString(),
		}
	},
	updateUser: async ({ request, locals }) => {
		const adminRoleKey = config.ownerRole
		const accessError = requireAdmin(locals, adminRoleKey)

		if (accessError) {
			return accessError
		}

		const db = getDbOrThrow(locals.db)
		const formData = await request.formData()
		const userId = parseUserId(formData.get("userId"))
		const fullName = String(formData.get("fullName") ?? "").trim()
		const selectedRoleKeys = getSubmittedRoleKeys(formData)

		if (!userId) {
			return fail(400, { message: "A valid user is required" })
		}

		if (!fullName) {
			return fail(400, { message: "Full name is required" })
		}

		if (selectedRoleKeys.length === 0) {
			return fail(400, { message: "At least one role is required" })
		}

		const selectedRoles = (
			await Promise.all(
				selectedRoleKeys.map(roleKey => getRoleByKey(db, roleKey))
			)
		).filter(Boolean)

		if (selectedRoles.length !== selectedRoleKeys.length) {
			return fail(400, { message: "The requested user changes are invalid" })
		}

		const coverage = await ensureAdminCoverage(db, adminRoleKey, userId, {
			canAccessAdmin: rolesHaveAdminAccess(selectedRoleKeys, adminRoleKey),
		})

		if (coverage.error) {
			return coverage.error
		}

		if (
			userId === locals.user!.id &&
			selectedRoleKeys.join("|") !==
				(coverage.currentUser?.roles.map(role => role.key).join("|") ?? "")
		) {
			return fail(400, {
				message: "You cannot change roles for your active session.",
			})
		}

		await db
			.update(users)
			.set({
				fullName,
			})
			.where(eq(users.id, userId))

		await replaceUserRoles(db, userId, selectedRoleKeys)

		return { message: "User updated" }
	},
	generateRegistrationLink: async ({ request, locals, url }) => {
		const adminRoleKey = config.ownerRole
		const accessError = requireAdmin(locals, adminRoleKey)

		if (accessError) {
			return accessError
		}

		const db = getDbOrThrow(locals.db)
		const formData = await request.formData()
		const userId = parseUserId(formData.get("userId"))

		if (!userId) {
			return fail(400, { message: "A valid user is required" })
		}

		const managedUser = await getManagedUser(db, userId, adminRoleKey)

		if (!managedUser) {
			return fail(404, { message: "The selected user was not found" })
		}

		if (!managedUser.isActive) {
			return fail(400, {
				message: "Only active users can receive a registration link.",
			})
		}

		if (await getUserPasskey(db, userId)) {
			return fail(409, {
				message: "This account already has a registered passkey.",
			})
		}

		const inviteNonce = createRegistrationInviteNonce()
		const inviteExpiresAt = createRegistrationInviteExpiry()

		await replaceRegistrationInvitation(
			db,
			userId,
			inviteNonce,
			inviteExpiresAt,
			locals.user!.id
		)

		return {
			message: "Registration link generated",
			registrationLink: new URL(
				`/register?invite_nonce=${encodeURIComponent(inviteNonce)}&email=${encodeURIComponent(managedUser.email)}`,
				url
			).toString(),
		}
	},
	setAccountStatus: async ({ request, locals }) => {
		const adminRoleKey = config.ownerRole
		const accessError = requireAdmin(locals, adminRoleKey)

		if (accessError) {
			return accessError
		}

		const db = getDbOrThrow(locals.db)
		const formData = await request.formData()
		const userId = parseUserId(formData.get("userId"))
		const isActive = parseIsActive(formData.get("isActive"))

		if (!userId || isActive === null) {
			return fail(400, { message: "A valid user status is required" })
		}

		if (userId === locals.user!.id && !isActive) {
			return fail(400, {
				message: "You cannot disable the account tied to your current session.",
			})
		}

		const coverage = await ensureAdminCoverage(db, adminRoleKey, userId, {
			isActive,
		})

		if (coverage.error) {
			return coverage.error
		}

		await db
			.update(users)
			.set({
				isActive,
			})
			.where(eq(users.id, userId))

		return {
			message: isActive ? "User enabled" : "User disabled",
		}
	},
	deleteUser: async ({ request, locals }) => {
		const adminRoleKey = config.ownerRole
		const accessError = requireAdmin(locals, adminRoleKey)

		if (accessError) {
			return accessError
		}

		const db = getDbOrThrow(locals.db)
		const formData = await request.formData()
		const userId = parseUserId(formData.get("userId"))

		if (!userId) {
			return fail(400, { message: "A valid user is required" })
		}

		if (userId === locals.user!.id) {
			return fail(400, {
				message:
					"Sign out instead of deleting the account you are actively using.",
			})
		}

		const coverage = await ensureAdminCoverage(db, adminRoleKey, userId, {
			canAccessAdmin: false,
			isActive: false,
		})

		if (coverage.error) {
			return coverage.error
		}

		await db.delete(users).where(eq(users.id, userId))

		return { message: "User removed" }
	},
}
