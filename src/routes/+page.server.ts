import { config, resolveAllowReturnUrls } from "$lib/server/config"
import { getDbOrThrow } from "$lib/server/db"
import { resolvePostAuthRedirect } from "$lib/server/helpers"
import { resolveSessionPrivateKey } from "$lib/server/roles"
import {
	appendSessionExchangeCodeToUrl,
	createSessionExchangeCode,
} from "$lib/server/session-exchange-code"
import {
	removeSessionExchangeCodeFromUrl,
	resolveSessionTokenIssuer,
	signSessionToken,
} from "$lib/server/session"
import { users } from "$lib/server/schema"
import { redirect } from "@sveltejs/kit"
import { sql } from "drizzle-orm"
import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const next = resolvePostAuthRedirect(
		url.searchParams.get("next"),
		url,
		resolveAllowReturnUrls(platform?.env)
	)

	if (locals.user && next) {
		const returnUrl = removeSessionExchangeCodeFromUrl(next)
		const sessionUser = {
			id: locals.user.id,
			email: locals.user.email,
			fullName: locals.user.fullName,
			role: locals.user.role,
			roleName: locals.user.roleName,
			roles: locals.user.roles,
		}
		const exchangeSession = await signSessionToken(
			sessionUser,
			resolveSessionPrivateKey(platform?.env),
			{
				audience: new URL(returnUrl).origin,
				issuer: resolveSessionTokenIssuer(url),
			}
		)
		const exchange = await createSessionExchangeCode(getDbOrThrow(locals.db), {
			returnUrl,
			token: exchangeSession.token,
		})

		throw redirect(
			303,
			appendSessionExchangeCodeToUrl(returnUrl, exchange.code)
		)
	}

	const db = getDbOrThrow(locals.db)
	const userCount = await db
		.select({
			count: sql<number>`count(*)`.mapWith(Number),
		})
		.from(users)
		.get()

	return {
		adminRoleKey: config.ownerRole,
		canBootstrapAdmin: Number(userCount?.count ?? 0) === 0,
		next,
		user: locals.user,
		appName: config.appName,
	}
}
