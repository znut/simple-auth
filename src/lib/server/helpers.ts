export function normalizeEmail(email?: string | null) {
	return email?.trim().toLowerCase() ?? ""
}

export function expectedOrigin(request: Request) {
	return new URL(request.url).origin
}

export function expectedRpId(request: Request) {
	return new URL(request.url).hostname
}

function isLocalhostHostname(hostname: string) {
	return hostname === "localhost" || hostname.endsWith(".localhost")
}

function isLocalhostDevelopmentOrigin(baseUrl: URL, targetUrl: URL) {
	return (
		baseUrl.protocol === targetUrl.protocol &&
		isLocalhostHostname(baseUrl.hostname) &&
		isLocalhostHostname(targetUrl.hostname)
	)
}

export function resolvePostAuthRedirect(
	next: string | null | undefined,
	requestUrl: URL | string,
	allowReturnUrls?: readonly string[]
) {
	if (!next) {
		return null
	}

	try {
		const baseUrl = requestUrl instanceof URL ? requestUrl : new URL(requestUrl)
		const targetUrl = new URL(next, baseUrl)

		if (!["http:", "https:"].includes(targetUrl.protocol)) {
			return null
		}

		if (targetUrl.origin === baseUrl.origin) {
			return targetUrl.toString()
		}

		if (!allowReturnUrls) {
			return isLocalhostDevelopmentOrigin(baseUrl, targetUrl)
				? targetUrl.toString()
				: null
		}

		const isAllowedReturnUrl = allowReturnUrls.some(allowedUrl => {
			const normalizedAllowedUrl = new URL(allowedUrl)
			return (
				targetUrl.origin === normalizedAllowedUrl.origin &&
				targetUrl.pathname === normalizedAllowedUrl.pathname
			)
		})

		if (!isAllowedReturnUrl) {
			return null
		}

		return targetUrl.toString()
	} catch {
		return null
	}
}
