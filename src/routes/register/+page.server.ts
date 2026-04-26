import { config } from "$lib/server/config"
import { getDbOrThrow } from "$lib/server/db"
import { resolveRegistrationInvite } from "$lib/server/registration-invite"
import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async ({ locals, url }) => {
	const inviteNonce = url.searchParams.get("invite_nonce") ?? ""
	const email = url.searchParams.get("email") ?? ""

	if (!inviteNonce || !email) {
		return {
			appName: config.appName,
			inviteNonce: "",
			email: "",
			inviteUser: null,
			inviteError: "This registration link is invalid or has expired.",
			user: locals.user,
		}
	}

	const db = getDbOrThrow(locals.db)
	const invite = await resolveRegistrationInvite(db, email, inviteNonce)

	return {
		appName: config.appName,
		inviteNonce,
		email,
		inviteUser: invite.ok
			? {
					fullName: invite.user.fullName,
					email: invite.user.email,
				}
			: null,
		inviteError: invite.ok ? null : invite.message,
		user: locals.user,
	}
}
