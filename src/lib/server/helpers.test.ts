import { describe, expect, it } from "vitest"
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
				"https://auth.example.com"
			)
		).toBe("https://office.example.com/dashboard")
		expect(
			resolvePostAuthRedirect(
				"javascript:alert('nope')",
				"https://auth.example.com"
			)
		).toBeNull()
	})
})
