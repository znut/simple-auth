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

	it("resolves secure host-only session cookie options", () => {
		expect(
			resolveSessionCookieOptions("http://auth.ex.localhost:5100")
		).toEqual({
			secure: true,
		})
		expect(resolveSessionCookieOptions("https://auth.example.com")).toEqual({
			secure: true,
		})
	})

	it("writes and clears __Host-prefixed session cookies", () => {
		const set = vi.fn()
		const remove = vi.fn()
		const options = {
			secure: true,
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
			expect.objectContaining(options)
		)
		expect(remove).toHaveBeenCalledWith(
			"__Host-simple_auth_session",
			expect.objectContaining(options)
		)
		expect(remove).toHaveBeenCalledTimes(1)
	})

	it("reads the session token from the cookie", () => {
		const cookies = {
			get: vi.fn(() => "cookie-token"),
		}

		expect(readSessionToken(cookies)).toBe("cookie-token")
		expect(cookies.get).toHaveBeenCalledWith("__Host-simple_auth_session")
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
