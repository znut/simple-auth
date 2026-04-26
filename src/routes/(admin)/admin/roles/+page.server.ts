import { config } from "$lib/server/config"
import { getDbOrThrow } from "$lib/server/db"
import {
	canAccessAdmin,
	createRoleKey,
	getRoleByKey,
	getRoleUsageCount,
	listRoles,
	roleHasAdminAccess,
} from "$lib/server/roles"
import { roles } from "$lib/server/schema"
import { fail } from "@sveltejs/kit"
import { and, eq, ne } from "drizzle-orm"
import type { Actions, PageServerLoad } from "./$types"

function requireAdmin(locals: App.Locals, adminRoleKey: string) {
	if (!canAccessAdmin(locals.user, adminRoleKey)) {
		return fail(403, { message: "Only admin-role users can manage roles" })
	}

	return null
}

export const load: PageServerLoad = async ({ locals }) => {
	const db = getDbOrThrow(locals.db)
	const adminRoleKey = config.ownerRole
	const availableRoles = await listRoles(db)
	const rolesWithUsage = await Promise.all(
		availableRoles.map(async role => ({
			...role,
			isAdminRole: roleHasAdminAccess(role.key, adminRoleKey),
			userCount: await getRoleUsageCount(db, role.key),
		}))
	)

	return {
		roles: rolesWithUsage,
	}
}

export const actions: Actions = {
	createRole: async ({ request, locals }) => {
		const adminRoleKey = config.ownerRole
		const accessError = requireAdmin(locals, adminRoleKey)

		if (accessError) {
			return accessError
		}

		const db = getDbOrThrow(locals.db)
		const formData = await request.formData()
		const name = String(formData.get("name") ?? "").trim()
		const description = String(formData.get("description") ?? "").trim()
		const key = createRoleKey(name)

		if (!name || !key) {
			return fail(400, { message: "A role name is required" })
		}

		const [existingRole, existingName] = await Promise.all([
			getRoleByKey(db, key),
			db
				.select({ key: roles.key })
				.from(roles)
				.where(eq(roles.name, name))
				.get(),
		])

		if (existingRole || existingName) {
			return fail(409, {
				message: "A role with that name already exists.",
			})
		}

		await db.insert(roles).values({
			key,
			name,
			description,
			isSystem: false,
		})

		return { message: "Role created" }
	},
	updateRole: async ({ request, locals }) => {
		const adminRoleKey = config.ownerRole
		const accessError = requireAdmin(locals, adminRoleKey)

		if (accessError) {
			return accessError
		}

		const db = getDbOrThrow(locals.db)
		const formData = await request.formData()
		const roleKey = String(formData.get("roleKey") ?? "")
		const name = String(formData.get("name") ?? "").trim()
		const description = String(formData.get("description") ?? "").trim()

		if (!roleKey || !name) {
			return fail(400, { message: "A valid role is required" })
		}

		const existingRole = await getRoleByKey(db, roleKey)

		if (!existingRole) {
			return fail(404, { message: "The selected role was not found" })
		}

		const conflictingRole = await db
			.select({ key: roles.key })
			.from(roles)
			.where(and(ne(roles.key, roleKey), eq(roles.name, name)))
			.get()

		if (conflictingRole) {
			return fail(409, { message: "Another role is already using that name." })
		}

		if (roleKey === adminRoleKey) {
			return fail(400, {
				message: "The configured admin role cannot be edited here.",
			})
		}

		await db
			.update(roles)
			.set({
				name,
				description,
			})
			.where(eq(roles.key, roleKey))

		return { message: "Role updated" }
	},
	deleteRole: async ({ request, locals }) => {
		const adminRoleKey = config.ownerRole
		const accessError = requireAdmin(locals, adminRoleKey)

		if (accessError) {
			return accessError
		}

		const db = getDbOrThrow(locals.db)
		const formData = await request.formData()
		const roleKey = String(formData.get("roleKey") ?? "")

		if (!roleKey) {
			return fail(400, { message: "A valid role is required" })
		}

		const existingRole = await getRoleByKey(db, roleKey)

		if (!existingRole) {
			return fail(404, { message: "The selected role was not found" })
		}

		if (existingRole.isSystem || roleKey === adminRoleKey) {
			return fail(400, {
				message: "System and configured admin roles cannot be deleted.",
			})
		}

		if ((await getRoleUsageCount(db, roleKey)) > 0) {
			return fail(400, {
				message: "Reassign users before deleting this role.",
			})
		}

		await db.delete(roles).where(eq(roles.key, roleKey))

		return { message: "Role removed" }
	},
}
