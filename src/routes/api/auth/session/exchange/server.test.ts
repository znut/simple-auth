import { beforeEach, describe, expect, it, vi } from "vitest"

const { consumeSessionExchangeCode, getDbOrThrow } = vi.hoisted(() => ({
	consumeSessionExchangeCode: vi.fn(),
	getDbOrThrow: vi.fn(),
}))

vi.mock("$lib/server/db", () => ({
	getDbOrThrow,
}))

vi.mock("$lib/server/session-exchange-code", () => ({
	consumeSessionExchangeCode,
}))

import { POST } from "./+server"

describe("POST /api/auth/session/exchange", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		getDbOrThrow.mockReturnValue({})
	})

	it("exchanges a one-time code for a session token", async () => {
		consumeSessionExchangeCode.mockResolvedValue({
			ok: true,
			token: "signed-session-token",
		})

		const response = await POST({
			request: new Request(
				"https://auth.example.com/api/auth/session/exchange",
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						code: "exchange-code",
						returnUrl: "https://dashboard.example.com/auth/callback?next=%2F",
					}),
				}
			),
			locals: {
				db: {} as never,
			},
		} as never)

		expect(consumeSessionExchangeCode).toHaveBeenCalledWith(
			{},
			"exchange-code",
			"https://dashboard.example.com/auth/callback?next=%2F"
		)
		await expect(response.json()).resolves.toEqual({
			token: "signed-session-token",
		})
	})

	it("rejects invalid or replayed codes", async () => {
		consumeSessionExchangeCode.mockResolvedValue({
			ok: false,
			message: "The session exchange code is invalid or has already been used.",
			status: 404,
		})

		const response = await POST({
			request: new Request(
				"https://auth.example.com/api/auth/session/exchange",
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						code: "exchange-code",
						returnUrl: "https://dashboard.example.com/auth/callback?next=%2F",
					}),
				}
			),
			locals: {
				db: {} as never,
			},
		} as never)

		expect(response.status).toBe(404)
		await expect(response.json()).resolves.toEqual({
			message: "The session exchange code is invalid or has already been used.",
		})
	})
})
