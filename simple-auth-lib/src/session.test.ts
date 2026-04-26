import { describe, expect, it, vi } from "vitest"
import {
	appendSessionTokenToUrl,
	clearSessionCookie,
	readSessionToken,
	resolveSessionCookieOptions,
	sessionCookieName,
	sessionTokenQueryParamName,
	setSessionCookie,
	shouldUseSecureCookies,
	verifySessionToken,
} from "./session"

async function createSessionToken(
	payload: Record<string, unknown>,
	secret: string
) {
	const payloadSegment = Buffer.from(JSON.stringify(payload)).toString(
		"base64url"
	)
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	)
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(payloadSegment)
	)

	return `${payloadSegment}.${Buffer.from(signature).toString("base64url")}`
}

describe("session helpers", () => {
	it("verifies signed enabled users", async () => {
		const secret = "top-secret"
		const token = await createSessionToken(
			{
				id: 7,
				email: "lead@example.com",
				fullName: "Factory Lead",
				role: "owner",
				roleName: "Owner",
				roles: [{ key: "owner", name: "Owner" }],
				iat: Date.now(),
				exp: Date.now() + 1_000,
			},
			secret
		)

		const verified = await verifySessionToken(token, secret)

		expect(verified).toMatchObject({
			id: 7,
			email: "lead@example.com",
			fullName: "Factory Lead",
			role: "owner",
			roleName: "Owner",
			roles: [{ key: "owner", name: "Owner" }],
		})
		expect(verified?.exp).toBeGreaterThan(verified?.iat ?? 0)
	})

	it("only marks https origins as secure-cookie capable", () => {
		expect(shouldUseSecureCookies("http://127.0.0.1:5100")).toBe(false)
		expect(shouldUseSecureCookies(new URL("http://localhost:4173"))).toBe(false)
		expect(shouldUseSecureCookies("https://dashboard.example.com")).toBe(true)
	})

	it("resolves a shared localhost cookie domain for local app hosts", () => {
		expect(
			resolveSessionCookieOptions("http://auth.ex.localhost:5100")
		).toEqual({
			secure: false,
			domain: "localhost",
		})
	})

	it("resolves a parent domain for sibling production hosts", () => {
		expect(resolveSessionCookieOptions("https://auth.example.com")).toEqual({
			secure: true,
			domain: "example.com",
		})
	})

	it("falls back to a host-only cookie for non-shareable hosts", () => {
		expect(resolveSessionCookieOptions("https://localhost")).toEqual({
			secure: true,
			domain: "localhost",
		})
		expect(resolveSessionCookieOptions("https://example.com")).toEqual({
			secure: true,
		})
		expect(resolveSessionCookieOptions("http://127.0.0.1:5100")).toEqual({
			secure: false,
		})
	})

	it("prefers an explicit cookie-domain override", () => {
		expect(
			resolveSessionCookieOptions("https://auth.example.com", ".custom.example")
		).toEqual({
			secure: true,
			domain: "custom.example",
		})
	})

	it("writes and clears both shared and host-only session cookies when a domain is set", () => {
		const set = vi.fn()
		const remove = vi.fn()
		const options = {
			secure: false,
			domain: "localhost",
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
			sessionCookieName,
			"token-value",
			expect.objectContaining(options)
		)
		expect(remove).toHaveBeenNthCalledWith(
			1,
			sessionCookieName,
			expect.not.objectContaining({ domain: expect.anything() })
		)
		expect(remove).toHaveBeenNthCalledWith(
			2,
			sessionCookieName,
			expect.not.objectContaining({ domain: expect.anything() })
		)
		expect(remove).toHaveBeenNthCalledWith(
			3,
			sessionCookieName,
			expect.objectContaining(options)
		)
	})

	it("appends the session token to a redirect url", () => {
		expect(
			appendSessionTokenToUrl(
				"https://dashboard.example.com/auth/callback?from=passkey",
				"signed-token"
			)
		).toBe(
			`https://dashboard.example.com/auth/callback?from=passkey&${sessionTokenQueryParamName}=signed-token`
		)
	})

	it("reads the session token from the return url before cookies", () => {
		const cookies = {
			get: vi.fn(() => "cookie-token"),
		}

		expect(
			readSessionToken(
				`https://dashboard.example.com/auth/callback?${sessionTokenQueryParamName}=url-token`,
				cookies
			)
		).toBe("url-token")
		expect(cookies.get).not.toHaveBeenCalled()
	})

	it("falls back to the session cookie when the return url has no token", () => {
		const cookies = {
			get: vi.fn(() => "cookie-token"),
		}

		expect(readSessionToken("https://dashboard.example.com/", cookies)).toBe(
			"cookie-token"
		)
		expect(cookies.get).toHaveBeenCalledWith(sessionCookieName)
	})
})
