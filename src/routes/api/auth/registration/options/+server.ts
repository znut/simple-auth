import { config } from "$lib/server/config"
import { getDbOrThrow } from "$lib/server/db"
import { expectedRpId, normalizeEmail } from "$lib/server/helpers"
import { resolveRegistrationInvite } from "$lib/server/registration-invite"
import { userRoles, users } from "$lib/server/schema"
import { createTimestamp } from "$lib/server/time"
import { generateRegistrationOptions } from "@simplewebauthn/server"
import { json } from "@sveltejs/kit"
import { eq, sql } from "drizzle-orm"
import type { RequestHandler } from "./$types"

export const POST: RequestHandler = async ({ request, locals }) => {
	const db = getDbOrThrow(locals.db)
	const adminRoleKey = config.ownerRole
	const { email, fullName, inviteNonce } = (await request.json()) as {
		email?: string
		fullName?: string
		inviteNonce?: string
	}
	if (inviteNonce && email) {
		const invite = await resolveRegistrationInvite(db, email, inviteNonce)

		if (!invite.ok) {
			return json({ message: invite.message }, { status: 400 })
		}

		const options = await generateRegistrationOptions({
			rpName: config.appName,
			rpID: expectedRpId(request),
			userName: invite.user.email,
			userDisplayName: invite.user.fullName,
			attestationType: "none",
			authenticatorSelection: {
				authenticatorAttachment: "platform",
				residentKey: "required",
				userVerification: "preferred",
			},
		})
		const webauthnUserId =
			typeof options.user.id === "string"
				? options.user.id
				: Buffer.from(options.user.id).toString("base64url")

		await db
			.update(users)
			.set({
				registrationChallenge: options.challenge,
				webauthnUserId: webauthnUserId,
			})
			.where(eq(users.id, invite.user.id))

		return json(options)
	}

	const normalizedEmail = normalizeEmail(email)
	const trimmedName = fullName?.trim() ?? ""

	if (!normalizedEmail || !trimmedName) {
		return json(
			{ message: "Email and full name are required" },
			{ status: 400 }
		)
	}

	const userCount = await db
		.select({
			count: sql<number>`count(*)`.mapWith(Number),
		})
		.from(users)
		.get()

	if (Number(userCount?.count ?? 0) > 0) {
		return json(
			{
				message:
					"Public registration is closed. Ask an admin to create an invitation.",
			},
			{ status: 403 }
		)
	}

	const options = await generateRegistrationOptions({
		rpName: config.appName,
		rpID: expectedRpId(request),
		userName: normalizedEmail,
		userDisplayName: trimmedName,
		attestationType: "none",
		authenticatorSelection: {
			authenticatorAttachment: "platform",
			residentKey: "required",
			userVerification: "preferred",
		},
	})
	const webauthnUserId =
		typeof options.user.id === "string"
			? options.user.id
			: Buffer.from(options.user.id).toString("base64url")

	await db.insert(users).values({
		email: normalizedEmail,
		fullName: trimmedName,
		isActive: true,
		approvedAt: createTimestamp(),
		registrationChallenge: options.challenge,
		authenticationChallenge: null,
		webauthnUserId: webauthnUserId,
		approvedBy: null,
		lastLoginAt: null,
	})

	const createdUser = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, normalizedEmail))
		.get()

	if (createdUser) {
		await db.insert(userRoles).values({
			userId: createdUser.id,
			roleKey: adminRoleKey,
		})
	}

	return json(options)
}
