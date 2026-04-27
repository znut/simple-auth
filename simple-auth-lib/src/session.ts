export const sessionCookieName = "simple_auth_session"
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
	exp: number
	iat: number
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
	domain?: string
	secure: boolean
}

function getBaseCookieOptions(options: SessionCookieOptions) {
	return {
		httpOnly: true,
		path: "/",
		sameSite: "lax" as const,
		secure: options.secure,
	}
}

function clearHostOnlySessionCookie(
	cookies: WritableCookieStore,
	options: SessionCookieOptions
) {
	cookies.delete(sessionCookieName, getBaseCookieOptions(options))
}

function decodeBase64Url(value: string) {
	return Buffer.from(value, "base64url")
}

async function importKey(secret: string) {
	return crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"]
	)
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

function normalizeCookieDomain(domain?: string | null) {
	const trimmedDomain = domain?.trim().replace(/^\.+/, "")

	return trimmedDomain ? trimmedDomain : undefined
}

function shouldShareLocalhostCookie(hostname: string) {
	return hostname === "localhost" || hostname.endsWith(".localhost")
}

function isIpAddress(hostname: string) {
	return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":")
}

export function resolveSessionCookieOptions(
	value: URL | Request | string,
	overrideDomain?: string | null
): SessionCookieOptions {
	const url =
		value instanceof URL
			? value
			: value instanceof Request
				? new URL(value.url)
				: new URL(value)
	const secure = shouldUseSecureCookies(url)
	const normalizedOverride = normalizeCookieDomain(overrideDomain)

	if (normalizedOverride) {
		return {
			secure,
			domain: normalizedOverride,
		}
	}

	if (shouldShareLocalhostCookie(url.hostname)) {
		return {
			secure,
			domain: "localhost",
		}
	}

	if (isIpAddress(url.hostname)) {
		return { secure }
	}

	const labels = url.hostname.split(".").filter(Boolean)

	if (labels.length >= 3) {
		return {
			secure,
			domain: labels.slice(-2).join("."),
		}
	}

	return { secure }
}

export async function verifySessionToken(token: string, secret: string) {
	const [payloadSegment, signatureSegment] = token.split(".")

	if (!payloadSegment || !signatureSegment) {
		return null
	}

	const key = await importKey(secret)
	const verified = await crypto.subtle.verify(
		"HMAC",
		key,
		decodeBase64Url(signatureSegment),
		new TextEncoder().encode(payloadSegment)
	)

	if (!verified) {
		return null
	}

	const payload = JSON.parse(
		decodeBase64Url(payloadSegment).toString()
	) as VerifiedSessionUser

	if (payload.exp <= Date.now()) {
		return null
	}

	return payload
}

export function readSessionToken(
	_value: URL | Request | string,
	cookies?: ReadableCookieStore
) {
	return cookies?.get(sessionCookieName) ?? null
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
	if (options.domain) {
		clearHostOnlySessionCookie(cookies, options)
	}

	cookies.set(sessionCookieName, token, {
		...getBaseCookieOptions(options),
		domain: options.domain,
		expires: new Date(expiresAt),
	})
}

export function clearSessionCookie(
	cookies: WritableCookieStore,
	options: SessionCookieOptions
) {
	if (options.domain) {
		clearHostOnlySessionCookie(cookies, options)
	}

	cookies.delete(sessionCookieName, {
		...getBaseCookieOptions(options),
		domain: options.domain,
	})
}
