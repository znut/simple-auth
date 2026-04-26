# Simple Auth

Simple Auth is a passkey-based authentication service built with SvelteKit. It also ships `@znut/simple-auth-lib` so downstream apps can verify session tokens returned from the auth service.

## Return-URL token flow

After a successful login or registration, Simple Auth now:

1. Signs a session token.
2. Sets its own `simple_auth_session` cookie for the auth app.
3. Appends the same token to the `next` URL as `simple_auth_token`.

This avoids relying on a shared parent-domain cookie between the auth app and the consumer app.

Example redirect:

```text
https://app.example.com/auth/callback?simple_auth_token=eyJ...
```

## App setup

The consumer app must share the same `SESSION_SECRET` as the auth service so it can verify returned tokens.

Install the library:

```bash
bun add @znut/simple-auth-lib
```

Create a callback route that reads the token from the return URL, verifies it, and stores it in the app's own cookie jar.

Example SvelteKit route:

```ts
// src/routes/auth/callback/+server.ts
import {
	readSessionToken,
	resolveSessionCookieOptions,
	setSessionCookie,
	verifySessionToken,
} from "@znut/simple-auth-lib"
import { redirect } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

const sessionSecret = process.env.SESSION_SECRET!

export const GET: RequestHandler = async ({ cookies, request, url }) => {
	const token = readSessionToken(request, cookies)

	if (!token) {
		throw redirect(303, "/login?error=missing-token")
	}

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

`readSessionToken(...)` checks `simple_auth_token` in the URL first, then falls back to the `simple_auth_session` cookie.
