<script lang="ts">
	import { resolve } from "$app/paths"
	import {
		browserSupportsWebAuthnAutofill,
		startAuthentication,
		startRegistration,
		WebAuthnAbortService,
	} from "@simplewebauthn/browser"
	import { onDestroy, onMount } from "svelte"

	export let data: {
		appName: string
		canBootstrapAdmin: boolean
		next: string | null
		adminRoleKey: string
		user: {
			id: number
			email: string
			fullName: string
			role: string
			roleName: string
			roles: {
				key: string
				name: string
			}[]
			isActive: boolean
		} | null
	}

	let email = data.user?.email ?? ""
	let fullName = ""
	let message = ""
	let error = ""
	let isWorking = false
	let activeUser = data.user
	let hasInitializedAutofill = false
	let automaticLoginTimer: ReturnType<typeof setTimeout> | null = null

	type ErrorPayload = {
		message?: string
	}

	type SignedInUser = NonNullable<typeof data.user>

	type AuthenticationOptionsPayload = Parameters<
		typeof startAuthentication
	>[0]["optionsJSON"]

	type AuthenticationVerifyPayload = {
		message?: string
		redirectTo?: string | null
		user: SignedInUser
	}

	type RegistrationOptionsPayload = Parameters<
		typeof startRegistration
	>[0]["optionsJSON"]

	type RegistrationVerifyPayload = {
		message: string
		redirectTo?: string | null
		user?: SignedInUser
	}

	const next = data.next
	const signOutHref = "/api/auth/logout?next=/"

	function canOpenAdmin(user: typeof activeUser) {
		return Boolean(user?.roles.some(role => role.key === data.adminRoleKey))
	}

	function resetFeedback() {
		error = ""
		message = ""
	}

	function clearAutomaticLoginTimer() {
		if (!automaticLoginTimer) {
			return
		}

		clearTimeout(automaticLoginTimer)
		automaticLoginTimer = null
	}

	function scheduleAutomaticLogin() {
		clearAutomaticLoginTimer()

		if (activeUser) {
			return
		}

		automaticLoginTimer = setTimeout(() => {
			automaticLoginTimer = null
			void beginAutomaticLogin()
		}, 1500)
	}

	function shouldIgnoreBackgroundLoginError(caught: unknown) {
		return (
			caught instanceof Error &&
			(caught.name === "AbortError" ||
				caught.name === "NotAllowedError" ||
				caught.message.includes(
					"Resident credentials or empty 'allowCredentials' lists are not supported at this time."
				))
		)
	}

	async function beginAutomaticLogin() {
		if (hasInitializedAutofill || activeUser) {
			return
		}

		hasInitializedAutofill = true

		if (!(await browserSupportsWebAuthnAutofill())) {
			return
		}

		void submitLogin({
			background: true,
			useBrowserAutofill: true,
		})
	}

	async function submitLogin(options?: {
		background?: boolean
		useBrowserAutofill?: boolean
	}) {
		const useBrowserAutofill = options?.useBrowserAutofill ?? false
		const background = options?.background ?? false
		clearAutomaticLoginTimer()
		hasInitializedAutofill = true

		if (!background) {
			resetFeedback()
			isWorking = true
		}

		try {
			const optionsResponse = await fetch("/api/auth/authentication/options", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify(email.trim() ? { email } : {}),
			})
			const optionsPayload = (await optionsResponse.json()) as unknown

			if (!optionsResponse.ok) {
				throw new Error(
					(optionsPayload as ErrorPayload).message ??
						"Unable to start passkey sign in"
				)
			}

			const credential = await startAuthentication({
				optionsJSON: optionsPayload as AuthenticationOptionsPayload,
				useBrowserAutofill,
			})

			const verifyResponse = await fetch("/api/auth/authentication/verify", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					email,
					credential,
					next,
				}),
			})
			const verifyPayload = (await verifyResponse.json()) as unknown

			if (!verifyResponse.ok) {
				throw new Error(
					(verifyPayload as ErrorPayload).message ?? "Unable to verify passkey"
				)
			}

			const authenticationPayload = verifyPayload as AuthenticationVerifyPayload

			if (authenticationPayload.redirectTo) {
				window.location.href = authenticationPayload.redirectTo
				return
			}

			activeUser = authenticationPayload.user
			message = authenticationPayload.message ?? "Login successful"
		} catch (caught) {
			if (background && shouldIgnoreBackgroundLoginError(caught)) {
				return
			}

			error =
				caught instanceof Error ? caught.message : "Passkey sign in failed"
		} finally {
			if (!background) {
				isWorking = false
			}
		}
	}

	async function submitRegistration() {
		WebAuthnAbortService.cancelCeremony()
		resetFeedback()
		isWorking = true

		try {
			const optionsResponse = await fetch("/api/auth/registration/options", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					email,
					fullName,
				}),
			})
			const optionsPayload = (await optionsResponse.json()) as unknown

			if (!optionsResponse.ok) {
				throw new Error(
					(optionsPayload as ErrorPayload).message ??
						"Unable to start registration"
				)
			}

			const credential = await startRegistration({
				optionsJSON: optionsPayload as RegistrationOptionsPayload,
			})

			const verifyResponse = await fetch("/api/auth/registration/verify", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					email,
					credential,
					next,
				}),
			})
			const verifyPayload = (await verifyResponse.json()) as unknown

			if (!verifyResponse.ok) {
				throw new Error(
					(verifyPayload as ErrorPayload).message ??
						"Unable to verify registration"
				)
			}

			const registrationPayload = verifyPayload as RegistrationVerifyPayload

			if (registrationPayload.redirectTo) {
				window.location.href = registrationPayload.redirectTo
				return
			}

			if (registrationPayload.user) {
				activeUser = registrationPayload.user
				email = registrationPayload.user.email
			}

			message = registrationPayload.message
		} catch (caught) {
			error =
				caught instanceof Error ? caught.message : "Passkey registration failed"
		} finally {
			isWorking = false
		}
	}

	onMount(() => {
		if (!activeUser) {
			scheduleAutomaticLogin()
		}
	})

	onDestroy(() => {
		clearAutomaticLoginTimer()
		WebAuthnAbortService.cancelCeremony()
	})
</script>

<svelte:head>
	<title>{data.appName} Access</title>
</svelte:head>

<div class="page-wrap min-h-screen px-5 py-6 md:px-8 md:py-8">
	<div class="mx-auto flex min-h-[calc(100vh-3rem)] max-w-2xl items-center">
		<section class="stitch-card w-full p-6 md:p-8">
			{#if activeUser}
				<div class="space-y-6">
					<div class="space-y-3">
						<h1 class="text-primary text-5xl font-black tracking-[-0.05em]">
							{data.appName}
						</h1>
					</div>

					<div class="stitch-muted-card space-y-4 p-5">
						<div>
							<p class="text-base-content text-lg font-black">
								{activeUser.fullName}
							</p>
							<p class="mt-2 text-sm text-[color:var(--stitch-surface-muted)]">
								{activeUser.email}
							</p>
							<p
								class="mt-2 text-xs font-bold tracking-[0.12em] text-[color:var(--stitch-surface-muted)] uppercase"
							>
								{activeUser.roleName}
							</p>
						</div>
					</div>

					{#if message}
						<div
							class="bg-primary/10 text-primary rounded-[1rem] px-4 py-3 text-sm"
						>
							{message}
						</div>
					{/if}

					<div class="flex flex-col gap-3 sm:flex-row">
						{#if canOpenAdmin(activeUser)}
							<a
								class="btn stitch-button-primary flex-1 border-none text-sm font-bold tracking-[0.16em] uppercase"
								href={resolve("/admin")}
							>
								Open admin
							</a>
						{/if}
						<form action={signOutHref} class="flex-1" method="GET">
							<button
								class="btn stitch-button-secondary w-full border-none text-sm font-bold tracking-[0.16em] uppercase"
								type="submit"
							>
								Sign out
							</button>
						</form>
					</div>
				</div>
			{:else}
				<div class="space-y-6">
					<div class="space-y-3">
						<h1
							class="text-base-content text-4xl font-black tracking-[-0.04em]"
						>
							Sign in to {data.appName}
						</h1>
					</div>

					<form
						class="space-y-5"
						onsubmit={async event => {
							event.preventDefault()
							await submitLogin()
						}}
					>
						<div class="stitch-form-field">
							<label for="email">Email (optional)</label>
							<input
								class="stitch-input input"
								autocomplete="username webauthn"
								bind:value={email}
								id="email"
								placeholder="admin@example.com"
								type="email"
							/>
						</div>

						{#if error}
							<div
								class="bg-error/10 text-error rounded-[1rem] px-4 py-3 text-sm"
							>
								{error}
							</div>
						{/if}

						{#if message}
							<div
								class="bg-primary/10 text-primary rounded-[1rem] px-4 py-3 text-sm"
							>
								{message}
							</div>
						{/if}

						<button
							class="btn stitch-button-primary w-full border-none text-sm font-bold tracking-[0.16em] uppercase"
							disabled={isWorking}
							type="submit"
						>
							{isWorking ? "Working..." : "Continue with passkey"}
						</button>
					</form>

					{#if data.canBootstrapAdmin}
						<div class="stitch-muted-card space-y-5 p-5">
							<div class="space-y-3">
								<p class="stitch-kicker">First-time setup</p>
								<h2
									class="text-base-content text-3xl font-black tracking-[-0.04em]"
								>
									Create the first owner account
								</h2>
							</div>

							<form
								class="space-y-5"
								onsubmit={async event => {
									event.preventDefault()
									await submitRegistration()
								}}
							>
								<div class="stitch-form-field">
									<label for="bootstrap-email">Email</label>
									<input
										class="stitch-input input"
										autocomplete="username"
										bind:value={email}
										id="bootstrap-email"
										placeholder="owner@example.com"
										required
										type="email"
									/>
								</div>

								<div class="stitch-form-field">
									<label for="bootstrap-full-name">Full name</label>
									<input
										class="stitch-input input"
										bind:value={fullName}
										id="bootstrap-full-name"
										placeholder="Suda K."
										required
										type="text"
									/>
								</div>

								<button
									class="btn stitch-button-secondary w-full border-none text-sm font-bold tracking-[0.16em] uppercase"
									disabled={isWorking}
									type="submit"
								>
									{isWorking ? "Working..." : "Create first owner"}
								</button>
							</form>
						</div>
					{/if}
				</div>
			{/if}
		</section>
	</div>
</div>
