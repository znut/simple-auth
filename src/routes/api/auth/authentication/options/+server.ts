import { setAuthenticationChallenge } from "$lib/server/authentication-challenge"
import { getDbOrThrow } from "$lib/server/db"
import { expectedRpId, normalizeEmail } from "$lib/server/helpers"
import { passkeys as passkeysTable, users } from "$lib/server/schema"
import { shouldUseSecureCookies } from "$lib/server/session"
import { generateAuthenticationOptions } from "@simplewebauthn/server"
import { json } from "@sveltejs/kit"
import { eq } from "drizzle-orm"
import type { RequestHandler } from "./$types"

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const db = getDbOrThrow(locals.db)
	const { email } = (await request.json()) as {
		email?: string
	}
	const normalizedEmail = normalizeEmail(email)

	if (normalizedEmail) {
		const user = await db
			.select()
			.from(users)
			.where(eq(users.email, normalizedEmail))
			.get()

		if (!user) {
			return json(
				{ message: "No registration was found for this Email" },
				{ status: 404 }
			)
		}

		if (!user.isActive) {
			return json(
				{ message: "This account is disabled. Please contact an admin." },
				{ status: 403 }
			)
		}

		const passkeys = await db
			.select()
			.from(passkeysTable)
			.where(eq(passkeysTable.userId, user.id))

		if (!passkeys.length) {
			return json(
				{ message: "No passkey is registered for this account yet" },
				{ status: 404 }
			)
		}

		const options = await generateAuthenticationOptions({
			rpID: expectedRpId(request),
			userVerification: "preferred",
			allowCredentials: passkeys.map(passkey => ({
				id: passkey.id,
				transports: passkey.transports ? JSON.parse(passkey.transports) : [],
			})),
		})

		setAuthenticationChallenge(
			cookies,
			options.challenge,
			shouldUseSecureCookies(request)
		)

		return json(options)
	}

	const options = await generateAuthenticationOptions({
		rpID: expectedRpId(request),
		userVerification: "preferred",
	})

	setAuthenticationChallenge(
		cookies,
		options.challenge,
		shouldUseSecureCookies(request)
	)

	return json(options)
}
