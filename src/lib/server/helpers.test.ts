import { describe, expect, it } from "vitest"
import { resolveAllowReturnUrls } from "./config"
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

	it("only resolves safe post-auth redirects", () => {
		expect(
			resolvePostAuthRedirect(
				"/dashboard?month=2026-04",
				"https://auth.example.com"
			)
		).toBe("https://auth.example.com/dashboard?month=2026-04")
		expect(
			resolvePostAuthRedirect(
				"https://office.example.com/dashboard",
				"https://auth.example.com",
				["https://office.example.com/dashboard"]
			)
		).toBe("https://office.example.com/dashboard")
		expect(
			resolvePostAuthRedirect(
				"https://office.example.com/dashboard/callback?next=%2F",
				"https://auth.example.com",
				["https://office.example.com/dashboard"]
			)
		).toBe("https://office.example.com/dashboard/callback?next=%2F")
		expect(
			resolvePostAuthRedirect(
				"https://office.example.com/admin",
				"https://auth.example.com",
				["https://office.example.com/dashboard"]
			)
		).toBeNull()
		expect(
			resolvePostAuthRedirect(
				"javascript:alert('nope')",
				"https://auth.example.com"
			)
		).toBeNull()
	})

	it("allows same top-domain cross-origin redirects when no allowlist is set", () => {
		expect(
			resolvePostAuthRedirect(
				"https://dashboard.example.com/auth/callback",
				"https://auth.example.com"
			)
		).toBe("https://dashboard.example.com/auth/callback")
		expect(
			resolvePostAuthRedirect(
				"http://dashboard.ex.localhost:4173/auth/callback",
				"http://auth.ex.localhost:5100"
			)
		).toBe("http://dashboard.ex.localhost:4173/auth/callback")
	})

	it("rejects other top-domain redirects when no allowlist is set", () => {
		expect(
			resolvePostAuthRedirect(
				"https://dashboard.other-example.com/auth/callback",
				"https://auth.example.com"
			)
		).toBeNull()
		expect(
			resolvePostAuthRedirect(
				"http://dashboard.example.com/auth/callback",
				"https://auth.example.com"
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

	it("returns undefined when the env allowlist is missing", () => {
		expect(resolveAllowReturnUrls()).toBeUndefined()
	})
})
