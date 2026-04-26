import { config } from "$lib/server/config"
import { canAccessAdmin } from "$lib/server/roles"
import { redirect } from "@sveltejs/kit"
import type { LayoutServerLoad } from "./$types"

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!canAccessAdmin(locals.user, config.ownerRole)) {
		throw redirect(303, "/")
	}

	return {
		user: locals.user,
		appName: config.appName,
	}
}
