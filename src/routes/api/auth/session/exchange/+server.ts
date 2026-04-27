import { getDbOrThrow } from "$lib/server/db"
import { consumeSessionExchangeCode } from "$lib/server/session-exchange-code"
import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

type ExchangeRequestBody = {
	code?: string
	returnUrl?: string
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { code, returnUrl } = (await request.json()) as ExchangeRequestBody

	const result = await consumeSessionExchangeCode(
		getDbOrThrow(locals.db),
		code ?? "",
		returnUrl ?? ""
	)

	if (!result.ok) {
		return json({ message: result.message }, { status: result.status })
	}

	return json({
		token: result.token,
	})
}
