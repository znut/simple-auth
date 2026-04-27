export function normalizeEmail(email?: string | null) {
	return email?.trim().toLowerCase() ?? ""
}

export function expectedOrigin(request: Request) {
	return new URL(request.url).origin
}

export function expectedRpId(request: Request) {
	return new URL(request.url).hostname
}

function resolveTopDomainHost(hostname: string) {
	if (hostname === "localhost") {
		return "localhost"
	}

	if (hostname.endsWith(".localhost")) {
		const labels = hostname.split(".").filter(Boolean)
		return labels.slice(-2).join(".")
	}

	if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":")) {
		return hostname
	}

	const labels = hostname.split(".").filter(Boolean)

	if (labels.length >= 2) {
		return labels.slice(-2).join(".")
	}

	return hostname
}

function isSameTopDomainOrigin(baseUrl: URL, targetUrl: URL) {
	return (
		baseUrl.protocol === targetUrl.protocol &&
		resolveTopDomainHost(baseUrl.hostname) ===
			resolveTopDomainHost(targetUrl.hostname)
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
			return isSameTopDomainOrigin(baseUrl, targetUrl)
				? targetUrl.toString()
				: null
		}

		const isAllowedReturnUrl = allowReturnUrls.some(allowedUrl => {
			try {
				const normalizedAllowedUrl = new URL(allowedUrl)

				if (!["http:", "https:"].includes(normalizedAllowedUrl.protocol)) {
					return false
				}

				if (targetUrl.origin !== normalizedAllowedUrl.origin) {
					return false
				}

				const allowedPath = normalizedAllowedUrl.pathname
				const targetPath = targetUrl.pathname

				if (allowedPath.endsWith("/")) {
					return targetPath.startsWith(allowedPath)
				}

				return (
					targetPath === allowedPath || targetPath.startsWith(`${allowedPath}/`)
				)
			} catch {
				return false
			}
		})

		if (!isAllowedReturnUrl) {
			return null
		}

		return targetUrl.toString()
	} catch {
		return null
	}
}
