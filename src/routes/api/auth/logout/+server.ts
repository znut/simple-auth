import { resolveAllowReturnUrls } from "$lib/server/config"
import { resolvePostAuthRedirect } from "$lib/server/helpers"
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
	throw redirect(
		303,
		resolvePostAuthRedirect(
			url.searchParams.get("next"),
			url,
			resolveAllowReturnUrls(platform?.env)
		) ?? "/"
	)
}
