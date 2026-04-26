import {
	createRegistrationInviteExpiry,
	createRegistrationInviteNonce,
	resolveRegistrationInvite,
} from "./registration-invite"
import { describe, expect, it } from "vitest"

describe("registration invite helpers", () => {
	it("creates a random invite nonce", () => {
		expect(createRegistrationInviteNonce()).toBeTypeOf("string")
		expect(createRegistrationInviteNonce()).not.toBe(
			createRegistrationInviteNonce()
		)
	})

	it("creates a 7 day invite expiry", () => {
		const now = Date.now()
		expect(createRegistrationInviteExpiry(now)).toBe(
			new Date(now + 1000 * 60 * 60 * 24 * 7).toISOString()
		)
	})

	it("rejects missing invite parameters", async () => {
		const result = await resolveRegistrationInvite({} as never, "", "")
		expect(result).toMatchObject({
			ok: false,
			message: "This registration link is invalid or has expired.",
		})
	})
})
