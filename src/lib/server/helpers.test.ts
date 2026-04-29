import { describe, expect, it } from "vitest"
import { resolveAllowReturnUrls, resolveUnsafeDevMode } from "./config"
import {
	expectedOrigin,
	expectedRpId,
	normalizeEmail,
	resolvePostAuthRedirect,
} from "./helpers"

describe("auth helpers", () => {
	it("normalizes Emails", () => {
		expect(normalizeEmail("  HR.Manager@Example.COM ")).toBe(
			"hr.manager@example.com"
		)
	})

	it("derives the relying-party origin and host", () => {
		const request = new Request("https://auth.example.com/api/authentication")

		expect(expectedOrigin(request)).toBe("https://auth.example.com")
		expect(expectedRpId(request)).toBe("auth.example.com")
	})

	it("allows same-origin post-auth redirects", () => {
		expect(
			resolvePostAuthRedirect(
				"/dashboard?month=2026-04",
				"https://auth.example.com"
			)
		).toBe("https://auth.example.com/dashboard?month=2026-04")
		expect(
			resolvePostAuthRedirect(
				"https://auth.example.com/settings",
				"https://auth.example.com"
			)
		).toBe("https://auth.example.com/settings")
	})

	it("allows exact allowlisted cross-origin redirects", () => {
		expect(
			resolvePostAuthRedirect(
				"https://office.example.com/dashboard",
				"https://auth.example.com",
				["https://office.example.com/dashboard"]
			)
		).toBe("https://office.example.com/dashboard")
		expect(
			resolvePostAuthRedirect(
				"https://office.example.com/dashboard?next=%2F",
				"https://auth.example.com",
				["https://office.example.com/dashboard"]
			)
		).toBe("https://office.example.com/dashboard?next=%2F")
	})

	it("rejects non-exact allowlisted cross-origin redirect paths", () => {
		expect(
			resolvePostAuthRedirect(
				"https://office.example.com/dashboard/callback?next=%2F",
				"https://auth.example.com",
				["https://office.example.com/dashboard"]
			)
		).toBeNull()
		expect(
			resolvePostAuthRedirect(
				"https://office.example.com/admin",
				"https://auth.example.com",
				["https://office.example.com/dashboard"]
			)
		).toBeNull()
	})

	it("rejects unsupported post-auth redirect schemes", () => {
		expect(
			resolvePostAuthRedirect(
				"javascript:alert('nope')",
				"https://auth.example.com"
			)
		).toBeNull()
	})

	it("allows localhost development cross-origin redirects when no allowlist is set", () => {
		expect(
			resolvePostAuthRedirect(
				"http://localhost:4173/auth/callback",
				"http://localhost:5100"
			)
		).toBe("http://localhost:4173/auth/callback")
		expect(
			resolvePostAuthRedirect(
				"http://dashboard.ex.localhost:4173/auth/callback",
				"http://auth.ex.localhost:5100"
			)
		).toBe("http://dashboard.ex.localhost:4173/auth/callback")
	})

	it("rejects non-localhost cross-origin redirects when no allowlist is set", () => {
		expect(
			resolvePostAuthRedirect(
				"https://dashboard.example.com/auth/callback",
				"https://auth.example.com"
			)
		).toBeNull()
		expect(
			resolvePostAuthRedirect(
				"http://dashboard.example.com/auth/callback",
				"https://auth.example.com"
			)
		).toBeNull()
		expect(
			resolvePostAuthRedirect(
				"http://dashboard.localhost.cc/auth/callback",
				"http://auth.localhost.cc"
			)
		).toBeNull()
		expect(
			resolvePostAuthRedirect(
				"https://dashboard.ex.localhost/auth/callback",
				"http://auth.ex.localhost"
			)
		).toBeNull()
	})

	it("parses the env-based return-url allowlist", () => {
		expect(
			resolveAllowReturnUrls({
				RETURN_URL_ALLOWLIST:
					" https://app.example.com/auth/callback, https://admin.example.com/auth/callback ",
			})
		).toEqual([
			"https://app.example.com/auth/callback",
			"https://admin.example.com/auth/callback",
		])
	})

	it("rejects invalid env-based return-url allowlist entries", () => {
		expect(() =>
			resolveAllowReturnUrls({
				RETURN_URL_ALLOWLIST: "not a url",
			})
		).toThrow("Invalid RETURN_URL_ALLOWLIST entry")
		expect(() =>
			resolveAllowReturnUrls({
				RETURN_URL_ALLOWLIST: "ftp://app.example.com/auth/callback",
			})
		).toThrow("must use http or https")
		expect(() =>
			resolveAllowReturnUrls({
				RETURN_URL_ALLOWLIST: "https://app.example.com/auth/callback?next=/",
			})
		).toThrow("must not include query strings or hashes")
		expect(() =>
			resolveAllowReturnUrls({
				RETURN_URL_ALLOWLIST: "https://app.example.com/auth/callback#code",
			})
		).toThrow("must not include query strings or hashes")
	})

	it("returns undefined when the env allowlist is missing", () => {
		expect(resolveAllowReturnUrls()).toBeUndefined()
	})

	it("enables unsafe dev mode only when explicitly set to true", () => {
		expect(resolveUnsafeDevMode()).toBe(false)
		expect(resolveUnsafeDevMode({ UNSAFE_DEV_MODE: "false" })).toBe(false)
		expect(resolveUnsafeDevMode({ UNSAFE_DEV_MODE: " true " })).toBe(true)
	})
})
