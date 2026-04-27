export const config = {
	appName: "Your App",
	ownerRole: "owner",
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
}
