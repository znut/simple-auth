import { createTimestamp } from "$lib/server/time"
import {
	blob,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core"

export const roles = sqliteTable("roles", {
	key: text().primaryKey(),
	name: text().notNull().unique(),
	description: text().notNull().default(""),
	isSystem: integer({ mode: "boolean" }).notNull().default(false),
	createdAt: text().notNull().$defaultFn(createTimestamp),
	updatedAt: text()
		.notNull()
		.$defaultFn(createTimestamp)
		.$onUpdateFn(createTimestamp),
})

export const users = sqliteTable("users", {
	id: integer().primaryKey({ autoIncrement: true }),
	email: text().notNull().unique(),
	fullName: text().notNull(),
	isActive: integer({ mode: "boolean" }).notNull().default(true),
	approvedBy: integer(),
	approvedAt: text(),
	registrationChallenge: text(),
	authenticationChallenge: text(),
	webauthnUserId: text(),
	createdAt: text().notNull().$defaultFn(createTimestamp),
	updatedAt: text()
		.notNull()
		.$defaultFn(createTimestamp)
		.$onUpdateFn(createTimestamp),
	lastLoginAt: text(),
})

export const userRoles = sqliteTable(
	"user_roles",
	{
		userId: integer()
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		roleKey: text()
			.notNull()
			.references(() => roles.key, { onDelete: "cascade" }),
		createdAt: text().notNull().$defaultFn(createTimestamp),
	},
	table => [
		primaryKey({ columns: [table.userId, table.roleKey] }),
		index("idx_user_roles_user_id").on(table.userId),
		index("idx_user_roles_role_key").on(table.roleKey),
	]
)

export const registrationInvitations = sqliteTable(
	"registration_invitations",
	{
		id: integer().primaryKey({ autoIncrement: true }),
		userId: integer()
			.notNull()
			.unique()
			.references(() => users.id, { onDelete: "cascade" }),
		nonce: text().notNull().unique(),
		expiresAt: text().notNull(),
		issuedBy: integer(),
		createdAt: text().notNull().$defaultFn(createTimestamp),
		updatedAt: text()
			.notNull()
			.$defaultFn(createTimestamp)
			.$onUpdateFn(createTimestamp),
	},
	table => [
		index("idx_registration_invitations_nonce").on(table.nonce),
		index("idx_registration_invitations_expires_at").on(table.expiresAt),
	]
)

export const passkeys = sqliteTable(
	"passkeys",
	{
		id: text().primaryKey(),
		userId: integer()
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		publicKey: blob({ mode: "buffer" }).notNull(),
		counter: integer().notNull().default(0),
		transports: text(),
		deviceType: text(),
		backedUp: integer({ mode: "boolean" }).notNull().default(false),
		createdAt: text().notNull().$defaultFn(createTimestamp),
		lastUsedAt: text(),
	},
	table => [index("idx_passkeys_user_id").on(table.userId)]
)

export const schema = {
	roles,
	users,
	userRoles,
	registrationInvitations,
	passkeys,
}

export type UserRow = typeof users.$inferSelect
export type RoleRow = typeof roles.$inferSelect
export type UserRoleRow = typeof userRoles.$inferSelect
