# Simple Auth

Simple Auth is a passkey-based authentication service built with SvelteKit. It also ships `@znut/simple-auth-lib` so downstream apps can verify session tokens exchanged from the auth service.

## Return-URL code flow

After a successful login or registration, Simple Auth now:

1. Signs a session token.
2. Sets its own `simple_auth_session` cookie for the auth app.
3. Stores the session token behind a short-lived, single-use exchange code.
4. Appends only that exchange code to the `next` URL as `simple_auth_code`.

This avoids putting bearer session tokens in browser-visible URLs while still supporting cross-domain handoff.

If `RETURN_URL_ALLOWLIST` is undefined, Simple Auth only allows:

1. Relative URLs on the auth app itself.
2. Absolute URLs on the same origin as the auth app.
3. Local development redirects where both hostnames are exactly `localhost` or end with `.localhost`, and the protocol matches.

If you need to allow production cross-origin returns, set `RETURN_URL_ALLOWLIST`.

Example `wrangler.jsonc` config:

```jsonc
{
	"vars": {
		"RETURN_URL_ALLOWLIST": "http://dashboard.ex.localhost:4173/auth/callback",
	},
	"env": {
		"production": {
			"vars": {
				"RETURN_URL_ALLOWLIST": "https://app.example.com/auth/callback",
			},
		},
	},
}
```

Use a comma-separated list for multiple URLs. Each allowlist entry must use `http` or `https`; matching uses the exact origin and exact path only, and entries must not include a query string or hash. Relative URLs on the auth app itself are still allowed automatically. Any cross-origin `next` URL that is not on the effective allowlist is ignored.

Example redirect:

```text
https://app.example.com/auth/callback?simple_auth_code=9Gm...
```

## App setup

The consumer app exchanges the one-time code with the auth service from its server-side callback route. The consumer app must share the same `SESSION_SECRET` as the auth service so it can verify exchanged tokens.

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

const sessionSecret = process.env.SESSION_SECRET!
const authOrigin = "https://auth.example.com"

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
	const session = await verifySessionToken(token, sessionSecret)

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

For server-side reads, prefer `readSessionToken(...)` before calling `verifySessionToken(...)`.

```ts
import { readSessionToken, verifySessionToken } from "@znut/simple-auth-lib"

const token = readSessionToken(event.request, event.cookies)
const session = token
	? await verifySessionToken(token, process.env.SESSION_SECRET!)
	: null
```

`readSessionToken(...)` reads only the `simple_auth_session` cookie. It does not accept bearer tokens from URLs.

## Deploy

Run the deployment initializer before your first production deploy:

```bash
bun run deploy:init
```

It updates:

- `wrangler.jsonc` production worker name, D1 name/id, and `SESSION_COOKIE_DOMAIN`
- `package.json` migration scripts with the production D1 database name
- `src/lib/server/config.ts` app name shown in the website

Deployment checklist:

- Set `SESSION_SECRET` in Cloudflare Worker `Settings -> Variables and Secrets -> Secrets`
- Configure the deploy build command as `bun run build`
- Configure the deploy command as `npx wrangler deploy --env production`
- Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in GitHub if you want migrations from GitHub Actions
- If those GitHub secrets are not configured, run `bun run db:migrate:remote` locally with Wrangler CLI instead
