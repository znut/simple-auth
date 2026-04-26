import {
	clearAuthenticationChallenge,
	getAuthenticationChallenge,
} from "$lib/server/authentication-challenge"
import { getDbOrThrow } from "$lib/server/db"
import {
	expectedOrigin,
	expectedRpId,
	normalizeEmail,
	resolvePostAuthRedirect,
} from "$lib/server/helpers"
import {
	listUserRoles,
	resolvePrimarySessionRole,
	resolveSessionSecret,
} from "$lib/server/roles"
import { passkeys, users } from "$lib/server/schema"
import {
	resolveSessionCookieOptions,
	setSessionCookie,
	shouldUseSecureCookies,
	signSessionToken,
} from "$lib/server/session"
import { createTimestamp } from "$lib/server/time"
import { verifyAuthenticationResponse } from "@simplewebauthn/server"
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
	const { email, credential, next } = (await request.json()) as {
		email?: string
		credential: unknown
		next?: string
	}
	const normalizedEmail = normalizeEmail(email)
	const challenge = getAuthenticationChallenge(cookies)

	if (!challenge) {
		return json(
			{ message: "Authentication request was not found" },
			{ status: 404 }
		)
	}

	const passkeyRecord = await db
		.select({
			passkeyId: passkeys.id,
			publicKey: passkeys.publicKey,
			counter: passkeys.counter,
			transports: passkeys.transports,
			userId: users.id,
			userEmail: users.email,
			userFullName: users.fullName,
			userIsActive: users.isActive,
		})
		.from(passkeys)
		.innerJoin(users, eq(passkeys.userId, users.id))
		.where(eq(passkeys.id, (credential as { id: string }).id))
		.get()

	if (!passkeyRecord) {
		clearAuthenticationChallenge(cookies, shouldUseSecureCookies(request))
		return json(
			{ message: "The passkey for this account was not found" },
			{ status: 404 }
		)
	}

	if (normalizedEmail && passkeyRecord.userEmail !== normalizedEmail) {
		clearAuthenticationChallenge(cookies, shouldUseSecureCookies(request))
		return json(
			{ message: "The selected passkey does not match that Email" },
			{ status: 403 }
		)
	}

	if (!passkeyRecord.userIsActive) {
		clearAuthenticationChallenge(cookies, shouldUseSecureCookies(request))
		return json(
			{ message: "This account is disabled. Please contact an admin." },
			{ status: 403 }
		)
	}

	const verification = await verifyAuthenticationResponse({
		response: credential as Parameters<
			typeof verifyAuthenticationResponse
		>[0]["response"],
		expectedChallenge: challenge,
		expectedOrigin: expectedOrigin(request),
		expectedRPID: expectedRpId(request),
		credential: {
			id: passkeyRecord.passkeyId,
			publicKey: new Uint8Array(passkeyRecord.publicKey),
			counter: passkeyRecord.counter,
			transports: passkeyRecord.transports
				? JSON.parse(passkeyRecord.transports)
				: [],
		},
	})

	if (!verification.verified) {
		clearAuthenticationChallenge(cookies, shouldUseSecureCookies(request))
		return json({ message: "Passkey verification failed" }, { status: 400 })
	}

	await db
		.update(passkeys)
		.set({
			counter: verification.authenticationInfo.newCounter,
			lastUsedAt: createTimestamp(),
		})
		.where(eq(passkeys.id, passkeyRecord.passkeyId))

	await db
		.update(users)
		.set({
			authenticationChallenge: null,
			lastLoginAt: createTimestamp(),
		})
		.where(eq(users.id, passkeyRecord.userId))

	clearAuthenticationChallenge(cookies, shouldUseSecureCookies(request))

	const assignedRoles =
		(await listUserRoles(db, [passkeyRecord.userId])).get(
			passkeyRecord.userId
		) ?? []
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
			id: passkeyRecord.userId,
			email: passkeyRecord.userEmail,
			fullName: passkeyRecord.userFullName,
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
		message: redirectTo ? undefined : "Login successful",
		redirectTo,
		user: {
			id: passkeyRecord.userId,
			email: passkeyRecord.userEmail,
			fullName: passkeyRecord.userFullName,
			role: primaryRole.key,
			roleName: primaryRole.name,
			roles: sessionRoles,
			isActive: passkeyRecord.userIsActive,
		},
	})
}
