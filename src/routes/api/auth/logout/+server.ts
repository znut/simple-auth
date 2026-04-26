import {
	clearSessionCookie,
	resolveSessionCookieOptions,
} from "$lib/server/session"
import { redirect } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

export const GET: RequestHandler = async ({ cookies, platform, url }) => {
	clearSessionCookie(
		cookies,
		resolveSessionCookieOptions(url, platform?.env.SESSION_COOKIE_DOMAIN)
	)
	throw redirect(303, url.searchParams.get("next") ?? "/")
}
