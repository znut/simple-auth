export const config = {
	appName: "Your App",
	ownerRole: "owner",
}

function normalizeReturnUrlAllowlistEntry(value: string) {
	let url: URL

	try {
		url = new URL(value)
	} catch {
		throw new Error(`Invalid RETURN_URL_ALLOWLIST entry: ${value}`)
	}

	if (!["http:", "https:"].includes(url.protocol)) {
		throw new Error(
			`RETURN_URL_ALLOWLIST entry must use http or https: ${value}`
		)
	}

	if (url.search || url.hash) {
		throw new Error(
			`RETURN_URL_ALLOWLIST entry must not include query strings or hashes: ${value}`
		)
	}

	return `${url.origin}${url.pathname}`
}

export function resolveAllowReturnUrls(env?: {
	RETURN_URL_ALLOWLIST?: string
}) {
	const configuredValue = env?.RETURN_URL_ALLOWLIST?.trim()

	if (!configuredValue) {
		return undefined
	}

	return configuredValue
		.split(",")
		.map(value => value.trim())
		.filter(Boolean)
		.map(normalizeReturnUrlAllowlistEntry)
}

export function resolveUnsafeDevMode(env?: { UNSAFE_DEV_MODE?: string }) {
	return env?.UNSAFE_DEV_MODE?.trim().toLowerCase() === "true"
}
