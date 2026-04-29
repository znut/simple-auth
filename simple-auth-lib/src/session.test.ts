import { describe, expect, it, vi } from "vitest"
import {
	clearSessionCookie,
	readSessionExchangeCode,
	readSessionToken,
	removeSessionExchangeCodeFromUrl,
	resolveSessionCookieOptions,
	setSessionCookie,
	shouldUseSecureCookies,
	verifySessionToken,
} from "./session"

async function createSessionKeyPair() {
	const keyPair = await crypto.subtle.generateKey(
		{
			name: "ECDSA",
			namedCurve: "P-256",
		},
		true,
		["sign", "verify"]
	)

	return {
		privateKey: await crypto.subtle.exportKey("jwk", keyPair.privateKey),
		publicKey: await crypto.subtle.exportKey("jwk", keyPair.publicKey),
	}
}

async function createSessionToken(
	payload: Record<string, unknown>,
	key: JsonWebKey
) {
	const headerSegment = Buffer.from(
		JSON.stringify({
			alg: "ES256",
			typ: "JWT",
		})
	).toString("base64url")
	const payloadSegment = Buffer.from(JSON.stringify(payload)).toString(
		"base64url"
	)
	const signingKey = await crypto.subtle.importKey(
		"jwk",
		key,
		{ name: "ECDSA", namedCurve: "P-256" },
		false,
		["sign"]
	)
	const signingInput = `${headerSegment}.${payloadSegment}`
	const signature = await crypto.subtle.sign(
		{ name: "ECDSA", hash: "SHA-256" },
		signingKey,
		new TextEncoder().encode(signingInput)
	)

	return `${signingInput}.${Buffer.from(signature).toString("base64url")}`
}

describe("session helpers", () => {
	it("verifies signed enabled users", async () => {
		const { privateKey, publicKey } = await createSessionKeyPair()
		const token = await createSessionToken(
			{
				aud: "https://dashboard.example.com",
				id: 7,
				email: "lead@example.com",
				fullName: "Factory Lead",
				iss: "https://auth.example.com",
				jti: "session-id",
				role: "owner",
				roleName: "Owner",
				roles: [{ key: "owner", name: "Owner" }],
				sub: "7",
				iat: Date.now(),
				exp: Date.now() + 1_000,
			},
			privateKey
		)

		const verified = await verifySessionToken(token, publicKey, {
			audience: "https://dashboard.example.com",
			issuer: "https://auth.example.com",
		})

		expect(verified).toMatchObject({
			aud: "https://dashboard.example.com",
			id: 7,
			email: "lead@example.com",
			fullName: "Factory Lead",
			iss: "https://auth.example.com",
			jti: "session-id",
			role: "owner",
			roleName: "Owner",
			roles: [{ key: "owner", name: "Owner" }],
			sub: "7",
		})
		expect(verified?.exp).toBeGreaterThan(verified?.iat ?? 0)
	})

	it("rejects tokens with the wrong issuer or audience", async () => {
		const { privateKey, publicKey } = await createSessionKeyPair()
		const token = await createSessionToken(
			{
				aud: "https://dashboard.example.com",
				id: 7,
				email: "lead@example.com",
				fullName: "Factory Lead",
				iss: "https://auth.example.com",
				jti: "session-id",
				role: "owner",
				roleName: "Owner",
				roles: [{ key: "owner", name: "Owner" }],
				sub: "7",
				iat: Date.now(),
				exp: Date.now() + 1_000,
			},
			privateKey
		)

		await expect(
			verifySessionToken(token, publicKey, {
				audience: "https://other.example.com",
				issuer: "https://auth.example.com",
			})
		).resolves.toBeNull()
		await expect(
			verifySessionToken(token, publicKey, {
				audience: "https://dashboard.example.com",
				issuer: "https://other-auth.example.com",
			})
		).resolves.toBeNull()
		await expect(verifySessionToken(token, publicKey)).resolves.toBeNull()
	})

	it("accepts env-file escaped public JWK strings", async () => {
		const { privateKey, publicKey } = await createSessionKeyPair()
		const token = await createSessionToken(
			{
				aud: "https://dashboard.example.com",
				id: 7,
				email: "lead@example.com",
				fullName: "Factory Lead",
				iss: "https://auth.example.com",
				jti: "session-id",
				role: "owner",
				roleName: "Owner",
				roles: [{ key: "owner", name: "Owner" }],
				sub: "7",
				iat: Date.now(),
				exp: Date.now() + 1_000,
			},
			privateKey
		)
		const escapedPublicKey = JSON.stringify(publicKey).replace(/"/g, '\\"')

		await expect(
			verifySessionToken(token, escapedPublicKey, {
				audience: "https://dashboard.example.com",
				issuer: "https://auth.example.com",
			})
		).resolves.toMatchObject({
			id: 7,
		})
	})

	it("only marks https origins as secure-cookie capable", () => {
		expect(shouldUseSecureCookies("http://127.0.0.1:5100")).toBe(false)
		expect(shouldUseSecureCookies(new URL("http://localhost:4173"))).toBe(false)
		expect(shouldUseSecureCookies("https://dashboard.example.com")).toBe(true)
	})

	it("resolves production session cookie options by default", () => {
		expect(resolveSessionCookieOptions()).toEqual({
			unsafeDevMode: false,
		})
	})

	it("resolves localhost-compatible session cookie options in unsafe dev mode", () => {
		expect(resolveSessionCookieOptions(true)).toEqual({
			unsafeDevMode: true,
		})
	})

	it("writes and clears __Host-prefixed session cookies for secure origins", () => {
		const set = vi.fn()
		const remove = vi.fn()
		const options = {
			unsafeDevMode: false,
		}

		setSessionCookie(
			{
				set,
				delete: remove,
			},
			"token-value",
			Date.now() + 1_000,
			options
		)
		clearSessionCookie(
			{
				set,
				delete: remove,
			},
			options
		)

		expect(set).toHaveBeenCalledWith(
			"__Host-simple_auth_session",
			"token-value",
			expect.objectContaining({ secure: true })
		)
		expect(remove).toHaveBeenCalledWith(
			"__Host-simple_auth_session",
			expect.objectContaining({ secure: true })
		)
		expect(remove).toHaveBeenCalledWith(
			"simple_auth_session",
			expect.objectContaining({ secure: true })
		)
		expect(remove).toHaveBeenCalledTimes(2)
	})

	it("writes and clears localhost-compatible session cookies in unsafe dev mode", () => {
		const set = vi.fn()
		const remove = vi.fn()
		const options = {
			unsafeDevMode: true,
		}

		setSessionCookie(
			{
				set,
				delete: remove,
			},
			"token-value",
			Date.now() + 1_000,
			options
		)
		clearSessionCookie(
			{
				set,
				delete: remove,
			},
			options
		)

		expect(set).toHaveBeenCalledWith(
			"simple_auth_session",
			"token-value",
			expect.objectContaining({ secure: false })
		)
		expect(remove).toHaveBeenCalledWith(
			"simple_auth_session",
			expect.objectContaining({ secure: false })
		)
		expect(remove).toHaveBeenCalledTimes(1)
	})

	it("reads the secure session token from the __Host-prefixed cookie", () => {
		const cookies = {
			get: vi.fn((name: string) =>
				name === "__Host-simple_auth_session" ? "cookie-token" : undefined
			),
		}

		expect(readSessionToken(cookies)).toBe("cookie-token")
		expect(cookies.get).toHaveBeenCalledWith("__Host-simple_auth_session")
		expect(cookies.get).not.toHaveBeenCalledWith("simple_auth_session")
	})

	it("reads the localhost-compatible session cookie for non-secure origins", () => {
		const cookies = {
			get: vi.fn((name: string) =>
				name === "simple_auth_session" ? "cookie-token" : undefined
			),
		}

		expect(readSessionToken(cookies, true)).toBe("cookie-token")
		expect(cookies.get).not.toHaveBeenCalledWith("__Host-simple_auth_session")
		expect(cookies.get).toHaveBeenCalledWith("simple_auth_session")
	})

	it("reads one-time session exchange codes from return urls", () => {
		expect(
			readSessionExchangeCode(
				"https://dashboard.example.com/auth/callback?simple_auth_code=exchange-code"
			)
		).toBe("exchange-code")
	})

	it("removes one-time session exchange codes from return urls", () => {
		expect(
			removeSessionExchangeCodeFromUrl(
				"https://dashboard.example.com/auth/callback?next=%2F&simple_auth_code=exchange-code"
			)
		).toBe("https://dashboard.example.com/auth/callback?next=%2F")
	})
})
