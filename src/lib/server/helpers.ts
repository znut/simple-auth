export function normalizeEmail(email?: string | null) {
	return email?.trim().toLowerCase() ?? ""
}

export function expectedOrigin(request: Request) {
	return new URL(request.url).origin
}

export function expectedRpId(request: Request) {
	return new URL(request.url).hostname
}

export function resolvePostAuthRedirect(
	next: string | null | undefined,
	requestUrl: URL | string
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

		return targetUrl.toString()
	} catch {
		return null
	}
}
