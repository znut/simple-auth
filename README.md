# Simple Auth

Simple Auth is a passkey-based authentication service for Cloudflare Worker. Use `@znut/simple-auth-lib` to verify session tokens exchanged from Simple Auth service.

## Return-URL code flow

After a successful login or registration, Simple Auth now:

1. Signs a session token.
2. Sets its own `__Host-simple_auth_session` cookie for the auth app.
3. Stores the session token behind a short-lived, single-use exchange code.
4. Appends only that exchange code to the `next` URL as `simple_auth_code`.

If `RETURN_URL_ALLOWLIST` is not set, we only allows:

1. Relative URLs on the auth app itself.
2. Absolute URLs on the same origin as the auth app.
3. Local development URLs is `localhost` or end with `.localhost`

Example `wrangler.jsonc` config:

```jsonc
{
	"vars": {
		"RETURN_URL_ALLOWLIST": "http://dashboard.ex.localhost:4173/auth/callback",
	},
	"env": {
		"production": {
			"vars": {
				"RETURN_URL_ALLOWLIST": "https://app.example.com/auth/callback,https://dashboard.example.com/auth/callback",
			},
		},
	},
}
```

Example redirect:

```text
https://app.example.com/auth/callback?simple_auth_code=9Gm...
```

## App setup

The consumer app exchanges the one-time code with the auth service from its server-side callback route. The auth service signs session tokens with `SESSION_PRIVATE_KEY_JWK`; consumers verify with `SESSION_PUBLIC_KEY_JWK`

Install the library:

```bash
bun add @znut/simple-auth-lib
```

Create a callback route that reads the token from the return URL, verifies it, and stores it in the app's own cookie jar.

Example SvelteKit route:

```ts
// src/routes/auth/callback/+server.ts
import {
	readSessionExchangeCode,
	readSessionToken,
	removeSessionExchangeCodeFromUrl,
	resolveSessionCookieOptions,
	setSessionCookie,
	verifySessionToken,
} from "@znut/simple-auth-lib"
import { redirect } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

const authOrigin = "https://auth.example.com"
const sessionPublicKey = process.env.SESSION_PUBLIC_KEY_JWK!

export const GET: RequestHandler = async ({ cookies, fetch, request, url }) => {
	const code = readSessionExchangeCode(request)

	if (!code) {
		throw redirect(303, "/login?error=missing-code")
	}

	const returnUrl = removeSessionExchangeCodeFromUrl(url)

	const exchangeResponse = await fetch(
		`${authOrigin}/api/auth/session/exchange`,
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				code,
				returnUrl,
			}),
		}
	)

	if (!exchangeResponse.ok) {
		throw redirect(303, "/login?error=invalid-code")
	}

	const { token } = (await exchangeResponse.json()) as { token: string }
	const session = await verifySessionToken(token, sessionPublicKey, {
		audience: url.origin,
		issuer: authOrigin,
	})

	if (!session) {
		throw redirect(303, "/login?error=invalid-token")
	}

	setSessionCookie(
		cookies,
		token,
		session.exp,
		resolveSessionCookieOptions(url)
	)

	throw redirect(303, "/")
}
```

## Reading the session

```ts
import { readSessionToken, verifySessionToken } from "@znut/simple-auth-lib"

const token = readSessionToken(event.cookies)
const session = token
	? await verifySessionToken(token, process.env.SESSION_PUBLIC_KEY_JWK!, {
			audience: event.url.origin,
			issuer: "https://auth.example.com",
		})
	: null
```

## Deploy

Run the deployment initializer before your first production deploy:

```bash
bun run deploy:init
```

It updates:

- `wrangler.jsonc` production worker name and D1 name/id
- `package.json` migration scripts with the production D1 database name
- `src/lib/server/config.ts` app name shown in the website

Deployment checklist:

- Generate an ES256 P-256 signing key pair as JWK with `bun run key:generate`.
- Set `SESSION_PRIVATE_KEY_JWK` only on the auth service in Cloudflare Worker `Settings -> Variables and Secrets -> Secrets`.
- Set `SESSION_PUBLIC_KEY_JWK` on the auth service and every consumer app that verifies Simple Auth tokens.
- Set `RETURN_URL_ALLOWLIST` for cross-origin returns
- Configure the deploy build command as `bun run build`
- Configure the deploy command as `npx wrangler deploy --env production`
- Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in GitHub if you want migrations from GitHub Actions
- If those GitHub secrets are not configured, run `bun run db:migrate:remote` locally with Wrangler CLI instead
