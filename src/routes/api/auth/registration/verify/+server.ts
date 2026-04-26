import { getDbOrThrow } from "$lib/server/db"
import {
	expectedOrigin,
	expectedRpId,
	normalizeEmail,
	resolvePostAuthRedirect,
} from "$lib/server/helpers"
import { resolveRegistrationInvite } from "$lib/server/registration-invite"
import {
	listUserRoles,
	resolvePrimarySessionRole,
	resolveSessionSecret,
} from "$lib/server/roles"
import {
	resolveSessionCookieOptions,
	setSessionCookie,
	signSessionToken,
} from "$lib/server/session"
import { passkeys, registrationInvitations, users } from "$lib/server/schema"
import { createTimestamp } from "$lib/server/time"
import { verifyRegistrationResponse } from "@simplewebauthn/server"
import { json } from "@sveltejs/kit"
import { eq } from "drizzle-orm"
import type { RequestHandler } from "./$types"

export const POST: RequestHandler = async ({
	request,
	locals,
	cookies,
	platform,
}) => {
	const db = getDbOrThrow(locals.db)
	const sessionSecret = resolveSessionSecret(platform?.env)
	const sessionCookieOptions = resolveSessionCookieOptions(
		request,
		platform?.env.SESSION_COOKIE_DOMAIN
	)
	const { email, inviteNonce, credential, next } = (await request.json()) as {
		email?: string
		inviteNonce?: string
		credential: unknown
		next?: string
	}
	const normalizedEmail = normalizeEmail(email)
	const invite =
		inviteNonce && normalizedEmail
			? await resolveRegistrationInvite(db, normalizedEmail, inviteNonce)
			: null
	const user =
		inviteNonce && normalizedEmail
			? invite?.ok
				? await db
						.select({
							id: users.id,
							email: users.email,
							fullName: users.fullName,
							isActive: users.isActive,
							registrationChallenge: users.registrationChallenge,
						})
						.from(users)
						.where(eq(users.id, invite.user.id))
						.get()
				: null
			: await db
					.select({
						id: users.id,
						email: users.email,
						fullName: users.fullName,
						isActive: users.isActive,
						registrationChallenge: users.registrationChallenge,
					})
					.from(users)
					.where(eq(users.email, normalizedEmail))
					.get()

	if (inviteNonce && normalizedEmail && !invite?.ok) {
		return json({ message: invite?.message }, { status: 400 })
	}

	if (!user?.registrationChallenge) {
		return json(
			{ message: "Registration request was not found" },
			{ status: 404 }
		)
	}

	const verification = await verifyRegistrationResponse({
		response: credential as Parameters<
			typeof verifyRegistrationResponse
		>[0]["response"],
		expectedChallenge: user.registrationChallenge,
		expectedOrigin: expectedOrigin(request),
		expectedRPID: expectedRpId(request),
	})

	if (!verification.verified || !verification.registrationInfo) {
		return json({ message: "Passkey verification failed" }, { status: 400 })
	}

	const existingPasskey = await db
		.select({ id: passkeys.id })
		.from(passkeys)
		.where(eq(passkeys.id, verification.registrationInfo.credential.id))
		.get()

	if (existingPasskey) {
		return json(
			{ message: "This passkey is already registered" },
			{ status: 409 }
		)
	}

	const publicKeyBytes = new Uint8Array(
		verification.registrationInfo.credential.publicKey
	)

	await db.insert(passkeys).values({
		id: verification.registrationInfo.credential.id,
		userId: user.id,
		publicKey: publicKeyBytes as never,
		counter: verification.registrationInfo.credential.counter,
		transports: JSON.stringify(
			(credential as { transports?: string[] }).transports ?? []
		),
		deviceType: verification.registrationInfo.credentialDeviceType,
		backedUp: verification.registrationInfo.credentialBackedUp,
		lastUsedAt: null,
	})

	await db
		.update(users)
		.set({
			registrationChallenge: null,
			lastLoginAt: createTimestamp(),
		})
		.where(eq(users.id, user.id))

	if (inviteNonce) {
		await db
			.delete(registrationInvitations)
			.where(eq(registrationInvitations.userId, user.id))
	}

	const assignedRoles = (await listUserRoles(db, [user.id])).get(user.id) ?? []
	const sessionRoles = assignedRoles.map(({ key, name }) => ({ key, name }))
	const primaryRole = resolvePrimarySessionRole(sessionRoles)

	if (!primaryRole) {
		return json(
			{ message: "This account does not have any assigned roles." },
			{ status: 403 }
		)
	}

	const session = await signSessionToken(
		{
			id: user.id,
			email: user.email,
			fullName: user.fullName,
			role: primaryRole.key,
			roleName: primaryRole.name,
			roles: sessionRoles,
		},
		sessionSecret
	)
	setSessionCookie(
		cookies,
		session.token,
		session.expiresAt,
		sessionCookieOptions
	)

	const redirectTo = resolvePostAuthRedirect(next, request.url)

	return json({
		message: redirectTo
			? "Access granted"
			: "Registration complete. You are signed in.",
		redirectTo,
		user: {
			id: user.id,
			email: user.email,
			fullName: user.fullName,
			role: primaryRole.key,
			roleName: primaryRole.name,
			roles: sessionRoles,
			isActive: user.isActive,
		},
	})
}
