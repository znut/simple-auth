import type { Cookies } from "@sveltejs/kit"

const authenticationChallengeCookieName = "simple_auth_authentication_challenge"
const authenticationChallengeDurationMs = 1000 * 60 * 5

export function getAuthenticationChallenge(cookies: Cookies) {
	return cookies.get(authenticationChallengeCookieName) ?? null
}

export function setAuthenticationChallenge(
	cookies: Cookies,
	challenge: string,
	secure = true
) {
	cookies.set(authenticationChallengeCookieName, challenge, {
		httpOnly: true,
		path: "/",
		sameSite: "lax",
		secure,
		expires: new Date(Date.now() + authenticationChallengeDurationMs),
	})
}

export function clearAuthenticationChallenge(cookies: Cookies, secure = true) {
	cookies.delete(authenticationChallengeCookieName, {
		httpOnly: true,
		path: "/",
		sameSite: "lax",
		secure,
	})
}
