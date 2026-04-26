import type { AppDatabase } from "$lib/server/db"
import {
	passkeys,
	registrationInvitations,
	users,
	type UserRow,
} from "$lib/server/schema"
import { and, eq } from "drizzle-orm"

const registrationInviteDurationMs = 1000 * 60 * 60 * 24 * 7

export type RegistrationInviteIdentity = Pick<
	UserRow,
	"id" | "email" | "fullName"
>

type RegistrationInviteResolution =
	| {
			ok: true
			user: UserRow
	  }
	| {
			ok: false
			message: string
	  }

export function createRegistrationInviteExpiry(now = Date.now()) {
	return new Date(now + registrationInviteDurationMs).toISOString()
}

export function createRegistrationInviteNonce() {
	return crypto.randomUUID()
}

export async function resolveRegistrationInvite(
	db: AppDatabase,
	email: string,
	inviteNonce: string
): Promise<RegistrationInviteResolution> {
	if (!email || !inviteNonce) {
		return {
			ok: false,
			message: "This registration link is invalid or has expired.",
		}
	}

	const user = await db
		.select({
			id: users.id,
			email: users.email,
			fullName: users.fullName,
			isActive: users.isActive,
			approvedBy: users.approvedBy,
			approvedAt: users.approvedAt,
			registrationChallenge: users.registrationChallenge,
			authenticationChallenge: users.authenticationChallenge,
			webauthnUserId: users.webauthnUserId,
			createdAt: users.createdAt,
			updatedAt: users.updatedAt,
			lastLoginAt: users.lastLoginAt,
			invitationNonce: registrationInvitations.nonce,
			invitationExpiresAt: registrationInvitations.expiresAt,
		})
		.from(registrationInvitations)
		.innerJoin(users, eq(users.id, registrationInvitations.userId))
		.where(
			and(
				eq(users.email, email),
				eq(registrationInvitations.nonce, inviteNonce)
			)
		)
		.get()

	if (!user) {
		return {
			ok: false,
			message: "This registration link is invalid or has expired.",
		}
	}

	if (!user.isActive) {
		return {
			ok: false,
			message: "This registration link is no longer active for that account.",
		}
	}

	if (!user.invitationNonce || !user.invitationExpiresAt) {
		return {
			ok: false,
			message: "This registration link has already been used or replaced.",
		}
	}

	const expiresAt = Date.parse(user.invitationExpiresAt)

	if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
		return {
			ok: false,
			message: "This registration link is invalid or has expired.",
		}
	}

	const existingPasskey = await db
		.select({ id: passkeys.id })
		.from(passkeys)
		.where(eq(passkeys.userId, user.id))
		.get()

	if (existingPasskey) {
		return {
			ok: false,
			message: "This account already has a registered passkey.",
		}
	}

	return {
		ok: true,
		user: {
			id: user.id,
			email: user.email,
			fullName: user.fullName,
			isActive: user.isActive,
			approvedBy: user.approvedBy,
			approvedAt: user.approvedAt,
			registrationChallenge: user.registrationChallenge,
			authenticationChallenge: user.authenticationChallenge,
			webauthnUserId: user.webauthnUserId,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
			lastLoginAt: user.lastLoginAt,
		},
	}
}
