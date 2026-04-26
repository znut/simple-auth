import {
	appendSessionTokenToUrl,
	clearSessionCookie,
	readSessionToken,
	resolveSessionCookieOptions,
	sessionCookieName,
	sessionDurationMs,
	sessionTokenQueryParamName,
	setSessionCookie,
	shouldUseSecureCookies,
	type SessionCookieOptions,
	type SessionRole,
	type SessionUser,
	type VerifiedSessionUser,
	verifySessionToken,
} from "@znut/simple-auth-lib"

export {
	appendSessionTokenToUrl,
	clearSessionCookie,
	readSessionToken,
	resolveSessionCookieOptions,
	sessionCookieName,
	sessionDurationMs,
	sessionTokenQueryParamName,
	setSessionCookie,
	shouldUseSecureCookies,
	verifySessionToken,
}

export type {
	SessionCookieOptions,
	SessionRole,
	SessionUser,
	VerifiedSessionUser,
}

function encodeBase64Url(value: string | Uint8Array) {
	return Buffer.from(value).toString("base64url")
}

async function importSigningKey(secret: string) {
	return crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	)
}

export async function signSessionToken(user: SessionUser, secret: string) {
	const payload: VerifiedSessionUser = {
		...user,
		iat: Date.now(),
		exp: Date.now() + sessionDurationMs,
	}
	const payloadSegment = encodeBase64Url(JSON.stringify(payload))
	const key = await importSigningKey(secret)
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(payloadSegment)
	)

	return {
		token: `${payloadSegment}.${encodeBase64Url(new Uint8Array(signature))}`,
		expiresAt: payload.exp,
	}
}
