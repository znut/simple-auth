import type { SessionUser } from "@znut/simple-auth-lib"
import type { AppDatabase } from "./lib/server/db"

declare global {
	namespace App {
		interface Locals {
			db?: AppDatabase
			sessionToken: string | null
			user:
				| (SessionUser & {
						isActive: boolean
				  })
				| null
		}

		interface Platform {
			env: {
				DB?: D1Database
				RETURN_URL_ALLOWLIST?: string
				SESSION_COOKIE_DOMAIN?: string
				SESSION_SECRET?: string
			}
		}
	}
}

export {}
