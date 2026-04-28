import { createDb } from "$lib/server/db"
import {
	listUserRoles,
	resolvePrimarySessionRole,
	resolveSessionPrivateKey,
	resolveSessionPublicKey,
} from "$lib/server/roles"
import {
	clearSessionCookie,
	readSessionToken,
	resolveSessionCookieOptions,
	resolveSessionTokenAudience,
	resolveSessionTokenIssuer,
	setSessionCookie,
	signSessionToken,
	verifySessionToken,
} from "$lib/server/session"
import { users } from "$lib/server/schema"
import type { Handle } from "@sveltejs/kit"
import { and, eq } from "drizzle-orm"

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null
	event.locals.sessionToken = null
	const sessionCookieOptions = resolveSessionCookieOptions(
		event.url,
		event.platform?.env.SESSION_COOKIE_DOMAIN
	)

	if (event.platform?.env?.DB) {
		event.locals.db = createDb(event.platform.env.DB)
	}
	const sessionPrivateKey = resolveSessionPrivateKey(event.platform?.env)
	const sessionPublicKey = resolveSessionPublicKey(event.platform?.env)
	const sessionIssuer = resolveSessionTokenIssuer(event.url)
	const sessionAudience = resolveSessionTokenAudience(event.url)

	const sessionToken = readSessionToken(event.url, event.cookies)
	if (sessionToken && event.locals.db) {
		const payload = await verifySessionToken(sessionToken, sessionPublicKey, {
			audience: sessionAudience,
			issuer: sessionIssuer,
		})

		if (payload) {
			const user = await event.locals.db
				.select({
					id: users.id,
					email: users.email,
					fullName: users.fullName,
					isActive: users.isActive,
				})
				.from(users)
				.where(and(eq(users.id, payload.id), eq(users.isActive, true)))
				.get()

			if (user) {
				const assignedRoles =
					(await listUserRoles(event.locals.db, [user.id])).get(user.id) ?? []
				const sessionRoles = assignedRoles.map(({ key, name }) => ({
					key,
					name,
				}))
				const primaryRole = resolvePrimarySessionRole(sessionRoles)

				if (!primaryRole) {
					clearSessionCookie(event.cookies, sessionCookieOptions)
					return resolve(event)
				}
				event.locals.user = {
					id: user.id,
					email: user.email,
					fullName: user.fullName,
					role: primaryRole.key,
					roleName: primaryRole.name,
					roles: sessionRoles,
					isActive: user.isActive,
				}
				const refreshedSession = await signSessionToken(
					{
						id: user.id,
						email: user.email,
						fullName: user.fullName,
						role: primaryRole.key,
						roleName: primaryRole.name,
						roles: sessionRoles,
					},
					sessionPrivateKey,
					{
						audience: sessionAudience,
						issuer: sessionIssuer,
					}
				)
				setSessionCookie(
					event.cookies,
					refreshedSession.token,
					refreshedSession.expiresAt,
					sessionCookieOptions
				)
				event.locals.sessionToken = refreshedSession.token
			} else {
				clearSessionCookie(event.cookies, sessionCookieOptions)
			}
		} else {
			clearSessionCookie(event.cookies, sessionCookieOptions)
		}
	}

	return resolve(event)
}
