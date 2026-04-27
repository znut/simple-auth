import { config, resolveAllowReturnUrls } from "$lib/server/config"
import { getDbOrThrow } from "$lib/server/db"
import { resolvePostAuthRedirect } from "$lib/server/helpers"
import {
	appendSessionExchangeCodeToUrl,
	createSessionExchangeCode,
} from "$lib/server/session-exchange-code"
import { removeSessionExchangeCodeFromUrl } from "$lib/server/session"
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
		if (!locals.sessionToken) {
			throw redirect(303, next)
		}

		const returnUrl = removeSessionExchangeCodeFromUrl(next)
		const exchange = await createSessionExchangeCode(getDbOrThrow(locals.db), {
			returnUrl,
			token: locals.sessionToken,
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
