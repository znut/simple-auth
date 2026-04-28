import {
	clearSessionCookie,
	readSessionToken,
	removeSessionExchangeCodeFromUrl,
	sessionExchangeCodeQueryParamName,
	resolveSessionCookieOptions,
	sessionCookieName,
	sessionDurationMs,
	setSessionCookie,
	shouldUseSecureCookies,
	type SessionCookieOptions,
	type SessionRole,
	type SessionTokenVerificationOptions,
	type SessionUser,
	type VerifiedSessionUser,
	verifySessionToken,
} from "@znut/simple-auth-lib"

export {
	clearSessionCookie,
	readSessionToken,
	removeSessionExchangeCodeFromUrl,
	sessionExchangeCodeQueryParamName,
	resolveSessionCookieOptions,
	sessionCookieName,
	sessionDurationMs,
	setSessionCookie,
	shouldUseSecureCookies,
	verifySessionToken,
}

export type {
	SessionCookieOptions,
	SessionRole,
	SessionTokenVerificationOptions,
	SessionUser,
	VerifiedSessionUser,
}

function encodeBase64Url(value: string | Uint8Array) {
	return Buffer.from(value).toString("base64url")
}

function parseJsonWebKey(value: JsonWebKey | string) {
	if (typeof value !== "string") {
		return value as JsonWebKey & { kid?: string }
	}

	const trimmedValue = value.trim()
	const normalizedValue =
		trimmedValue.startsWith("{\\") && trimmedValue.endsWith("}")
			? trimmedValue.replace(/\\"/g, '"')
			: trimmedValue
	const parsedValue = JSON.parse(normalizedValue) as
		| string
		| (JsonWebKey & { kid?: string })

	return typeof parsedValue === "string"
		? (JSON.parse(parsedValue) as JsonWebKey & { kid?: string })
		: parsedValue
}

async function importSigningKey(privateKey: JsonWebKey | string) {
	return crypto.subtle.importKey(
		"jwk",
		parseJsonWebKey(privateKey),
		{ name: "ECDSA", namedCurve: "P-256" },
		false,
		["sign"]
	)
}

export interface SessionTokenSigningOptions {
	audience: string
	issuer: string
	tokenId?: string
}

export function resolveSessionTokenIssuer(value: URL | Request | string) {
	const url =
		value instanceof URL
			? value
			: value instanceof Request
				? new URL(value.url)
				: new URL(value)

	return url.origin
}

export function resolveSessionTokenAudience(value: URL | Request | string) {
	return resolveSessionTokenIssuer(value)
}

export async function signSessionToken(
	user: SessionUser,
	privateKey: JsonWebKey | string,
	options: SessionTokenSigningOptions
) {
	const privateJwk = parseJsonWebKey(privateKey)
	const header = {
		alg: "ES256",
		...(privateJwk.kid ? { kid: privateJwk.kid } : {}),
		typ: "JWT",
	}
	const payload: VerifiedSessionUser = {
		...user,
		aud: options.audience,
		iat: Date.now(),
		exp: Date.now() + sessionDurationMs,
		iss: options.issuer,
		jti: options.tokenId ?? crypto.randomUUID(),
		sub: String(user.id),
	}
	const headerSegment = encodeBase64Url(JSON.stringify(header))
	const payloadSegment = encodeBase64Url(JSON.stringify(payload))
	const signingInput = `${headerSegment}.${payloadSegment}`
	const key = await importSigningKey(privateJwk)
	const signature = await crypto.subtle.sign(
		{ name: "ECDSA", hash: "SHA-256" },
		key,
		new TextEncoder().encode(signingInput)
	)

	return {
		token: `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`,
		expiresAt: payload.exp,
	}
}
