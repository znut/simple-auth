import { config } from "$lib/server/config"
import { getDbOrThrow } from "$lib/server/db"
import { resolvePostAuthRedirect } from "$lib/server/helpers"
import { appendSessionTokenToUrl } from "$lib/server/session"
import { users } from "$lib/server/schema"
import { redirect } from "@sveltejs/kit"
import { sql } from "drizzle-orm"
import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async ({ locals, url }) => {
	const next = resolvePostAuthRedirect(url.searchParams.get("next"), url)

	if (locals.user && next) {
		throw redirect(
			303,
			locals.sessionToken
				? appendSessionTokenToUrl(next, locals.sessionToken)
				: next
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
