import type { AppDatabase } from "$lib/server/db"
import { roles, userRoles, users } from "$lib/server/schema"
import type { SessionRole, SessionUser } from "@znut/simple-auth-lib"
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm"

export const ownerRoleKey = "owner"
export const userRoleKey = "user"

function getRequiredEnvVar(
	env:
		| {
				SESSION_SECRET?: string
		  }
		| null
		| undefined,
	name: "SESSION_SECRET"
) {
	const value = env?.[name]?.trim()

	if (!value) {
		throw new Error(`Missing required auth environment variable: ${name}`)
	}

	return value
}

export function resolveSessionSecret(env?: { SESSION_SECRET?: string }) {
	return getRequiredEnvVar(env, "SESSION_SECRET")
}

export function roleHasAdminAccess(
	roleKey: string | null | undefined,
	adminRoleKey: string
) {
	return Boolean(roleKey) && roleKey === adminRoleKey
}

export function rolesHaveAdminAccess(
	roleKeys: readonly string[] | null | undefined,
	adminRoleKey: string
) {
	return Boolean(roleKeys?.some(roleKey => roleKey === adminRoleKey))
}

export function canAccessAdmin(
	user: Pick<SessionUser, "roles"> | null,
	adminRoleKey: string
) {
	return rolesHaveAdminAccess(
		user?.roles?.map(role => role.key),
		adminRoleKey
	)
}

export function normalizeRoleKeys(values: Iterable<string>) {
	const seen = new Set<string>()
	const roleKeys: string[] = []

	for (const value of values) {
		const roleKey = value.trim()

		if (!roleKey || seen.has(roleKey)) {
			continue
		}

		seen.add(roleKey)
		roleKeys.push(roleKey)
	}

	return roleKeys
}

export function createRoleKey(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
}

export async function listRoles(db: AppDatabase) {
	return db
		.select({
			key: roles.key,
			name: roles.name,
			description: roles.description,
			isSystem: roles.isSystem,
			createdAt: roles.createdAt,
			updatedAt: roles.updatedAt,
		})
		.from(roles)
		.orderBy(asc(roles.name))
}

export async function listUserRoles(
	db: AppDatabase,
	userIds: number[]
): Promise<Map<number, SessionRole[]>> {
	if (userIds.length === 0) {
		return new Map()
	}

	const assignments = await db
		.select({
			userId: userRoles.userId,
			roleKey: roles.key,
			roleName: roles.name,
		})
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleKey, roles.key))
		.where(inArray(userRoles.userId, userIds))
		.orderBy(asc(roles.name))

	const rolesByUserId = new Map<number, SessionRole[]>()

	for (const assignment of assignments) {
		const currentRoles = rolesByUserId.get(assignment.userId) ?? []
		currentRoles.push({
			key: assignment.roleKey,
			name: assignment.roleName,
		})
		rolesByUserId.set(assignment.userId, currentRoles)
	}

	return rolesByUserId
}

export function resolvePrimarySessionRole(assignedRoles: SessionRole[]) {
	return assignedRoles[0] ?? null
}

export async function replaceUserRoles(
	db: AppDatabase,
	userId: number,
	roleKeys: string[]
) {
	await db.delete(userRoles).where(eq(userRoles.userId, userId))

	if (roleKeys.length === 0) {
		return
	}

	await db.insert(userRoles).values(
		roleKeys.map(roleKey => ({
			userId,
			roleKey,
		}))
	)
}

export async function getRoleByKey(db: AppDatabase, key: string) {
	return db
		.select({
			key: roles.key,
			name: roles.name,
			description: roles.description,
			isSystem: roles.isSystem,
		})
		.from(roles)
		.where(eq(roles.key, key))
		.get()
}

export async function countOtherActiveAdminUsers(
	db: AppDatabase,
	adminRoleKey: string,
	excludedUserId?: number,
	excludedRoleKey?: string
) {
	const result = await db
		.select({
			count: sql<number>`count(distinct ${users.id})`.mapWith(Number),
		})
		.from(users)
		.innerJoin(userRoles, eq(userRoles.userId, users.id))
		.where(
			and(
				eq(users.isActive, true),
				eq(userRoles.roleKey, adminRoleKey),
				excludedUserId ? ne(users.id, excludedUserId) : undefined,
				excludedRoleKey ? ne(userRoles.roleKey, excludedRoleKey) : undefined
			)
		)
		.get()

	return Number(result?.count ?? 0)
}

export async function getRoleUsageCount(db: AppDatabase, roleKey: string) {
	const result = await db
		.select({
			count: sql<number>`count(distinct ${userRoles.userId})`.mapWith(Number),
		})
		.from(userRoles)
		.where(eq(userRoles.roleKey, roleKey))
		.get()

	return Number(result?.count ?? 0)
}

export async function getActiveRoleUsageCount(
	db: AppDatabase,
	roleKey: string
) {
	const result = await db
		.select({
			count: sql<number>`count(distinct ${users.id})`.mapWith(Number),
		})
		.from(users)
		.innerJoin(userRoles, eq(userRoles.userId, users.id))
		.where(and(eq(userRoles.roleKey, roleKey), eq(users.isActive, true)))
		.get()

	return Number(result?.count ?? 0)
}
