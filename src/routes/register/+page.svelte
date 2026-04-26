<script lang="ts">
	import { startRegistration } from "@simplewebauthn/browser"
	import type { PageProps } from "./$types"

	let { data }: PageProps = $props()

	// svelte-ignore state_referenced_locally
	let activeUser = $state(data.user)
	let message = $state("")
	// svelte-ignore state_referenced_locally
	let error = $state(data.inviteError ?? "")
	let isWorking = $state(false)
	let appName = $derived(data.appName)

	type ErrorPayload = {
		message?: string
	}

	type RegistrationOptionsPayload = Parameters<
		typeof startRegistration
	>[0]["optionsJSON"]

	type RegistrationVerifyPayload = {
		message: string
		redirectTo?: string | null
		user?: NonNullable<typeof data.user>
	}

	async function submitRegistration() {
		if (!data.inviteNonce || !data.email || !data.inviteUser) {
			return
		}

		message = ""
		error = ""
		isWorking = true

		try {
			const optionsResponse = await fetch("/api/auth/registration/options", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					inviteNonce: data.inviteNonce,
					email: data.email,
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
					inviteNonce: data.inviteNonce,
					email: data.email,
					credential,
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
			}

			message = registrationPayload.message
		} catch (caught) {
			error =
				caught instanceof Error ? caught.message : "Passkey registration failed"
		} finally {
			isWorking = false
		}
	}
</script>

<svelte:head>
	<title>Register Passkey</title>
</svelte:head>

<div class="page-wrap min-h-screen px-5 py-6 md:px-8 md:py-8">
	<div class="mx-auto flex min-h-[calc(100vh-3rem)] max-w-2xl items-center">
		<section class="stitch-card w-full space-y-6 p-6 md:p-8">
			<div class="space-y-3">
				<p class="stitch-kicker">{appName} Access</p>
				<h1 class="text-base-content text-4xl font-black tracking-[-0.04em]">
					Register your passkey
				</h1>
				<p class="text-sm leading-7 text-[color:var(--stitch-surface-muted)]">
					Finish your account setup with the one-time registration link from an
					admin.
				</p>
			</div>

			{#if activeUser}
				<div
					class="bg-primary/10 text-primary rounded-[1rem] px-4 py-3 text-sm"
				>
					{message || "Registration complete. You are signed in."}
				</div>
			{:else if data.inviteUser}
				<form
					class="space-y-5"
					onsubmit={async event => {
						event.preventDefault()
						await submitRegistration()
					}}
				>
					<div class="stitch-form-field">
						<label for="invite-full-name">Full name</label>
						<input
							class="stitch-input input"
							id="invite-full-name"
							readonly
							type="text"
							value={data.inviteUser.fullName}
						/>
					</div>

					<div class="stitch-form-field">
						<label for="invite-email">Email</label>
						<input
							class="stitch-input input"
							id="invite-email"
							readonly
							type="email"
							value={data.inviteUser.email}
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
						{isWorking ? "Working..." : "Register passkey"}
					</button>
				</form>
			{:else}
				<div class="bg-error/10 text-error rounded-[1rem] px-4 py-3 text-sm">
					{error}
				</div>
			{/if}
		</section>
	</div>
</div>
