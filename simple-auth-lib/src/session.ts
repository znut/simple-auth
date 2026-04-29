export const sessionCookieName = "__Host-simple_auth_session"
export const localSessionCookieName = "simple_auth_session"
export const sessionExchangeCodeQueryParamName = "simple_auth_code"
export const sessionDurationMs = 1000 * 60 * 60 * 12

export interface SessionRole {
	key: string
	name: string
}

export interface SessionUser {
	id: number
	email: string
	fullName: string
	role: string
	roleName: string
	roles: SessionRole[]
}

export interface VerifiedSessionUser extends SessionUser {
	aud: string
	exp: number
	iat: number
	iss: string
	jti: string
	sub: string
}

export interface SessionTokenVerificationOptions {
	audience: string | readonly string[]
	issuer: string
}

type SessionJsonWebKey = JsonWebKey & {
	kid?: string
}

interface WritableCookieStore {
	set(
		name: string,
		value: string,
		options: {
			domain?: string
			httpOnly?: boolean
			path: string
			sameSite?: "lax" | "strict" | "none"
			secure?: boolean
			expires?: Date
		}
	): void
	delete(
		name: string,
		options: {
			domain?: string
			httpOnly?: boolean
			path: string
			sameSite?: "lax" | "strict" | "none"
			secure?: boolean
		}
	): void
}

interface ReadableCookieStore {
	get(name: string): string | undefined
}

export interface SessionCookieOptions {
	unsafeDevMode: boolean
}

function getBaseCookieOptions(options: SessionCookieOptions) {
	return {
		httpOnly: true,
		path: "/",
		sameSite: "lax" as const,
		secure: !options.unsafeDevMode,
	}
}

function decodeBase64Url(value: string) {
	return Buffer.from(value, "base64url")
}

function parseJsonWebKey(value: JsonWebKey | string): SessionJsonWebKey {
	if (typeof value !== "string") {
		return value
	}

	const trimmedValue = value.trim()
	const normalizedValue =
		trimmedValue.startsWith("{\\") && trimmedValue.endsWith("}")
			? trimmedValue.replace(/\\"/g, '"')
			: trimmedValue
	const parsedValue = JSON.parse(normalizedValue) as string | SessionJsonWebKey

	return typeof parsedValue === "string"
		? (JSON.parse(parsedValue) as SessionJsonWebKey)
		: parsedValue
}

async function importVerificationKey(publicKey: JsonWebKey | string) {
	const parsedPublicKey = parseJsonWebKey(publicKey)

	return crypto.subtle.importKey(
		"jwk",
		parsedPublicKey,
		{ name: "ECDSA", namedCurve: "P-256" },
		false,
		["verify"]
	)
}

function timingSafeEqual(value: string, expected: string) {
	const valueBytes = new TextEncoder().encode(value)
	const expectedBytes = new TextEncoder().encode(expected)

	if (valueBytes.length !== expectedBytes.length) {
		return false
	}

	let difference = 0

	for (let index = 0; index < valueBytes.length; index += 1) {
		difference |= valueBytes[index] ^ expectedBytes[index]
	}

	return difference === 0
}

function isAllowedAudience(
	value: string,
	expected: string | readonly string[]
) {
	return typeof expected === "string"
		? timingSafeEqual(value, expected)
		: expected.some(audience => timingSafeEqual(value, audience))
}

export function shouldUseSecureCookies(value: URL | Request | string) {
	const url =
		value instanceof URL
			? value
			: value instanceof Request
				? new URL(value.url)
				: new URL(value)

	return url.protocol === "https:"
}

export function resolveSessionCookieOptions(
	unsafeDevMode = false
): SessionCookieOptions {
	return { unsafeDevMode }
}

export async function verifySessionToken(
	token: string,
	publicKey: JsonWebKey | string,
	options?: SessionTokenVerificationOptions
) {
	if (!options) {
		return null
	}

	const tokenSegments = token.split(".")
	const [headerSegment, payloadSegment, signatureSegment] = tokenSegments

	if (
		tokenSegments.length !== 3 ||
		!headerSegment ||
		!payloadSegment ||
		!signatureSegment
	) {
		return null
	}

	let header: { alg?: string; kid?: string; typ?: string }
	let payload: VerifiedSessionUser
	let parsedPublicKey: SessionJsonWebKey

	try {
		header = JSON.parse(decodeBase64Url(headerSegment).toString()) as {
			alg?: string
			kid?: string
			typ?: string
		}
		payload = JSON.parse(
			decodeBase64Url(payloadSegment).toString()
		) as VerifiedSessionUser
		parsedPublicKey = parseJsonWebKey(publicKey)
	} catch {
		return null
	}

	if (header.alg !== "ES256" || header.typ !== "JWT") {
		return null
	}

	if (
		parsedPublicKey.kid &&
		header.kid &&
		!timingSafeEqual(header.kid, parsedPublicKey.kid)
	) {
		return null
	}

	const key = await importVerificationKey(parsedPublicKey)
	const verified = await crypto.subtle.verify(
		{ name: "ECDSA", hash: "SHA-256" },
		key,
		decodeBase64Url(signatureSegment),
		new TextEncoder().encode(`${headerSegment}.${payloadSegment}`)
	)

	if (!verified) {
		return null
	}

	if (payload.exp <= Date.now()) {
		return null
	}

	if (!timingSafeEqual(payload.iss, options.issuer)) {
		return null
	}

	if (!isAllowedAudience(payload.aud, options.audience)) {
		return null
	}

	return payload
}

export function readSessionToken(
	cookies: ReadableCookieStore | undefined,
	unsafeDevMode = false
) {
	return (
		cookies?.get(unsafeDevMode ? localSessionCookieName : sessionCookieName) ??
		null
	)
}

function resolveUrl(value: URL | Request | string) {
	return value instanceof URL
		? value
		: value instanceof Request
			? new URL(value.url)
			: new URL(value)
}

export function readSessionExchangeCode(
	value: URL | Request | string,
	searchParamName = sessionExchangeCodeQueryParamName
) {
	return resolveUrl(value).searchParams.get(searchParamName)
}

export function removeSessionExchangeCodeFromUrl(
	value: URL | Request | string,
	searchParamName = sessionExchangeCodeQueryParamName
) {
	const url = new URL(resolveUrl(value))
	url.searchParams.delete(searchParamName)
	return url.toString()
}

export function setSessionCookie(
	cookies: WritableCookieStore,
	token: string,
	expiresAt: number,
	options: SessionCookieOptions
) {
	cookies.set(
		options.unsafeDevMode ? localSessionCookieName : sessionCookieName,
		token,
		{
			...getBaseCookieOptions(options),
			expires: new Date(expiresAt),
		}
	)
}

export function clearSessionCookie(
	cookies: WritableCookieStore,
	options: SessionCookieOptions
) {
	const cookieOptions = getBaseCookieOptions(options)

	cookies.delete(
		options.unsafeDevMode ? localSessionCookieName : sessionCookieName,
		cookieOptions
	)

	if (!options.unsafeDevMode) {
		cookies.delete(localSessionCookieName, cookieOptions)
	}
}
