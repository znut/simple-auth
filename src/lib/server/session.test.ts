import { describe, expect, it } from "vitest"
import { signSessionToken, verifySessionToken } from "./session"

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

describe("server session helpers", () => {
	it("signs ES256 session tokens that verify with the public key", async () => {
		const { privateKey, publicKey } = await createSessionKeyPair()

		const session = await signSessionToken(
			{
				id: 7,
				email: "lead@example.com",
				fullName: "Factory Lead",
				role: "owner",
				roleName: "Owner",
				roles: [{ key: "owner", name: "Owner" }],
			},
			privateKey,
			{
				audience: "https://dashboard.example.com",
				issuer: "https://auth.example.com",
				tokenId: "session-id",
			}
		)

		const verified = await verifySessionToken(session.token, publicKey, {
			audience: "https://dashboard.example.com",
			issuer: "https://auth.example.com",
		})

		expect(verified).toMatchObject({
			aud: "https://dashboard.example.com",
			id: 7,
			iss: "https://auth.example.com",
			jti: "session-id",
			sub: "7",
		})
	})

	it("accepts env-file escaped JWK strings", async () => {
		const { privateKey, publicKey } = await createSessionKeyPair()
		const escapedPrivateKey = JSON.stringify(privateKey).replace(/"/g, '\\"')
		const session = await signSessionToken(
			{
				id: 7,
				email: "lead@example.com",
				fullName: "Factory Lead",
				role: "owner",
				roleName: "Owner",
				roles: [{ key: "owner", name: "Owner" }],
			},
			escapedPrivateKey,
			{
				audience: "https://dashboard.example.com",
				issuer: "https://auth.example.com",
			}
		)

		const verified = await verifySessionToken(session.token, publicKey, {
			audience: "https://dashboard.example.com",
			issuer: "https://auth.example.com",
		})

		expect(verified?.id).toBe(7)
	})
})
