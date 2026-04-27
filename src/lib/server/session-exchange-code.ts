import type { AppDatabase } from "$lib/server/db"
import { authSessionCodes } from "$lib/server/schema"
import {
	removeSessionExchangeCodeFromUrl,
	sessionExchangeCodeQueryParamName,
} from "$lib/server/session"
import { createTimestamp } from "$lib/server/time"
import { eq } from "drizzle-orm"

export const sessionExchangeCodeDurationMs = 1000 * 60 * 2

type SessionExchangeCodePayload = {
	returnUrl: string
	token: string
}

type ConsumedSessionExchangeCode =
	| {
			ok: true
			token: string
	  }
	| {
			ok: false
			message: string
			status: 400 | 404 | 410
	  }

function encodeBase64Url(value: string | Uint8Array) {
	return Buffer.from(value).toString("base64url")
}

async function hashSessionExchangeCode(code: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(code)
	)

	return encodeBase64Url(new Uint8Array(digest))
}

export function createSessionExchangeCodeExpiry(now = Date.now()) {
	return createTimestamp(new Date(now + sessionExchangeCodeDurationMs))
}

export function createSessionExchangeCodeValue() {
	const bytes = new Uint8Array(32)
	crypto.getRandomValues(bytes)
	return encodeBase64Url(bytes)
}

export function appendSessionExchangeCodeToUrl(
	value: URL | string,
	code: string
) {
	const url = new URL(removeSessionExchangeCodeFromUrl(value))
	url.searchParams.set(sessionExchangeCodeQueryParamName, code)
	return url.toString()
}

export async function createSessionExchangeCode(
	db: AppDatabase,
	payload: SessionExchangeCodePayload
) {
	const code = createSessionExchangeCodeValue()
	const expiresAt = createSessionExchangeCodeExpiry()

	await db.insert(authSessionCodes).values({
		codeHash: await hashSessionExchangeCode(code),
		token: payload.token,
		returnUrl: payload.returnUrl,
		expiresAt,
	})

	return {
		code,
		expiresAt,
	}
}

export async function consumeSessionExchangeCode(
	db: AppDatabase,
	code: string,
	returnUrl: string
): Promise<ConsumedSessionExchangeCode> {
	const normalizedCode = code.trim()

	if (!normalizedCode || !returnUrl) {
		return {
			ok: false,
			message: "The session exchange code is required.",
			status: 400,
		}
	}

	const [record] = await db
		.delete(authSessionCodes)
		.where(
			eq(
				authSessionCodes.codeHash,
				await hashSessionExchangeCode(normalizedCode)
			)
		)
		.returning()

	if (!record) {
		return {
			ok: false,
			message: "The session exchange code is invalid or has already been used.",
			status: 404,
		}
	}

	if (record.returnUrl !== returnUrl) {
		return {
			ok: false,
			message: "The session exchange code was not issued for this return URL.",
			status: 400,
		}
	}

	if (Date.parse(record.expiresAt) <= Date.now()) {
		return {
			ok: false,
			message: "The session exchange code has expired.",
			status: 410,
		}
	}

	return {
		ok: true,
		token: record.token,
	}
}
