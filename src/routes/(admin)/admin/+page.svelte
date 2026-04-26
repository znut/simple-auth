<script lang="ts">
	import type { PageProps } from "./$types"

	let { data, form }: PageProps = $props()

	const activeUsers = $derived(
		data.managedUsers.filter(user => user.isActive).length
	)
	const adminUsers = $derived(
		data.managedUsers.filter(user => user.canAccessAdmin && user.isActive)
			.length
	)
	const sortedManagedUsers = $derived(
		[...data.managedUsers].sort((left, right) => {
			if (left.id === data.currentUserId) {
				return -1
			}

			if (right.id === data.currentUserId) {
				return 1
			}

			return 0
		})
	)

	function formatDate(value: string | null) {
		if (!value) {
			return "Never"
		}

		return new Intl.DateTimeFormat("en-US", {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(value))
	}
</script>

<svelte:head>
	<title>User Management</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<p
			class="text-base-content/60 text-xs font-extrabold tracking-[0.16em] uppercase"
		>
			Admin
		</p>
		<h2 class="text-base-content mt-2 text-4xl font-black tracking-[-0.05em]">
			User management
		</h2>
	</div>

	{#if form?.message}
		<div
			class="alert alert-info bg-primary/10 text-primary border-primary/10 rounded-2xl text-sm"
		>
			{form.message}
		</div>
	{/if}

	{#if form?.registrationLink}
		<section class="card bg-base-100 border-base-300 border shadow-sm">
			<div class="card-body space-y-4 p-5">
				<div>
					<p
						class="text-base-content/60 text-xs font-extrabold tracking-[0.16em] uppercase"
					>
						Special registration link
					</p>
					<h3
						class="text-base-content mt-2 text-2xl font-black tracking-[-0.04em]"
					>
						Share this one-time onboarding URL
					</h3>
					<p
						class="mt-2 text-sm leading-7 text-[color:var(--stitch-surface-muted)]"
					>
						It expires in 7 days and becomes invalid after a passkey is
						registered or a newer link is issued.
					</p>
				</div>
				<label class="form-control">
					<span
						class="label-text text-base-content/60 text-xs font-extrabold tracking-[0.12em] uppercase"
					>
						Registration link
					</span>
					<input
						class="input input-bordered bg-base-200 mt-2 w-full rounded-xl"
						id="registration-link"
						readonly
						type="text"
						value={form.registrationLink}
					/>
				</label>
			</div>
		</section>
	{/if}

	<div
		class="stats stats-vertical bg-base-100 border-base-300 md:stats-horizontal grid gap-4 border shadow-sm md:grid-cols-3"
	>
		<div class="stat">
			<div class="stat-title">Total users</div>
			<div class="stat-value text-base-content text-3xl">
				{data.managedUsers.length}
			</div>
		</div>
		<div class="stat">
			<div class="stat-title">Active accounts</div>
			<div class="stat-value text-base-content text-3xl">{activeUsers}</div>
		</div>
		<div class="stat">
			<div class="stat-title">Admin-role users</div>
			<div class="stat-value text-base-content text-3xl">{adminUsers}</div>
		</div>
	</div>

	<div class="collapse-arrow bg-base-100 border-base-300 collapse border">
		<input type="checkbox" />
		<div
			class="collapse-title text-base-content text-2xl font-black tracking-[-0.04em]"
		>
			Create new account
		</div>
		<div class="collapse-content">
			<form class="grid gap-4 md:grid-cols-2" method="POST">
				<label class="form-control">
					<span
						class="label-text text-base-content/60 text-xs font-extrabold tracking-[0.12em] uppercase"
					>
						Full name
					</span>
					<input
						class="input input-bordered bg-base-200 mt-2 w-full rounded-xl"
						id="new-full-name"
						name="fullName"
						required
						type="text"
					/>
				</label>

				<label class="form-control">
					<span
						class="label-text text-base-content/60 text-xs font-extrabold tracking-[0.12em] uppercase"
					>
						Email
					</span>
					<input
						class="input input-bordered bg-base-200 mt-2 w-full rounded-xl"
						id="new-email"
						name="email"
						required
						type="email"
					/>
				</label>

				<fieldset class="form-control md:col-span-2">
					<legend
						class="label-text text-base-content/60 text-xs font-extrabold tracking-[0.12em] uppercase"
					>
						Roles
					</legend>
					<div
						class="bg-base-200 mt-2 grid gap-2 rounded-xl p-4 md:grid-cols-3"
					>
						{#each data.availableRoles as role, index (role.key)}
							<label class="label cursor-pointer justify-start gap-3">
								<input
									checked={index === 0}
									class="checkbox checkbox-sm"
									name="roleKeys"
									type="checkbox"
									value={role.key}
								/>
								<span class="label-text">
									<span class="block font-semibold">{role.name}</span>
									<span class="text-base-content/60 text-xs"
										>{role.description}</span
									>
								</span>
							</label>
						{/each}
					</div>
				</fieldset>

				<div class="md:col-span-2">
					<button
						class="btn btn-primary text-xs font-bold tracking-[0.16em] uppercase"
						formaction="?/createUserInvite"
						type="submit"
					>
						Create user and generate link
					</button>
				</div>
			</form>
		</div>
	</div>

	<section class="card bg-base-100 border-base-300 border shadow-sm">
		<div class="card-body overflow-hidden p-6">
			<p
				class="text-base-content/60 text-xs font-extrabold tracking-[0.16em] uppercase"
			>
				User list
			</p>
			<div class="mt-5 overflow-x-auto">
				<table class="table-pin-rows table min-w-[1080px]">
					<thead>
						<tr class="text-base-content/60">
							<th></th>
							<th>Email</th>
							<th>Full name</th>
							<th>Role</th>
							<th>Status</th>
							<th>Created</th>
							<th>Last login</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedManagedUsers as managedUser (managedUser.id)}
							<tr
								class="border-b border-[color:rgba(212,195,189,0.22)] align-top"
							>
								<td class="py-5">
									{#if managedUser.id === data.currentUserId}
										<div
											aria-label="Current session"
											class="bg-primary/10 text-primary inline-flex h-8 w-8 items-center justify-center rounded-full"
											title="Current session"
										>
											<svg
												aria-hidden="true"
												class="h-4.5 w-4.5"
												fill="none"
												stroke="currentColor"
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												viewBox="0 0 24 24"
											>
												<circle cx="12" cy="12" r="3" />
												<path d="M12 2v2" />
												<path d="M12 20v2" />
												<path d="m4.93 4.93 1.41 1.41" />
												<path d="m17.66 17.66 1.41 1.41" />
												<path d="M2 12h2" />
												<path d="M20 12h2" />
												<path d="m6.34 17.66-1.41 1.41" />
												<path d="m19.07 4.93-1.41 1.41" />
											</svg>
											<span class="sr-only">Current session</span>
										</div>
									{/if}
								</td>
								<td class="py-5">
									<p class="text-base-content/70 text-sm">
										{managedUser.email}
									</p>
								</td>
								<td class="py-5">
									<form class="flex min-w-64 items-end gap-2" method="POST">
										<input name="userId" type="hidden" value={managedUser.id} />
										{#each managedUser.roles as role (role.key)}
											<input name="roleKeys" type="hidden" value={role.key} />
										{/each}
										<label class="form-control flex-1">
											<input
												class="input input-bordered bg-base-200 h-10 min-h-10 w-full text-sm"
												name="fullName"
												required
												type="text"
												value={managedUser.fullName}
											/>
										</label>
										<button
											aria-label={`Save full name for ${managedUser.fullName}`}
											class="btn btn-primary h-10 min-h-10 w-10 px-0"
											formaction="?/updateUser"
											type="submit"
										>
											<svg
												aria-hidden="true"
												class="h-4.5 w-4.5"
												fill="none"
												stroke="currentColor"
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												viewBox="0 0 24 24"
											>
												<path
													d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"
												/>
												<path d="M17 21v-8H7v8" />
												<path d="M7 3v5h8" />
											</svg>
											<span class="sr-only">Save full name</span>
										</button>
									</form>
								</td>
								<td class="py-5">
									<div class="flex min-w-72 flex-wrap gap-2">
										{#each data.availableRoles as role (role.key)}
											{@const isEnabled = managedUser.roles.some(
												assignedRole => assignedRole.key === role.key
											)}
											<form method="POST">
												<input
													name="userId"
													type="hidden"
													value={managedUser.id}
												/>
												<input
													name="fullName"
													type="hidden"
													value={managedUser.fullName}
												/>
												{#each data.availableRoles as candidateRole (candidateRole.key)}
													{@const shouldInclude =
														candidateRole.key === role.key
															? !isEnabled
															: managedUser.roles.some(
																	assignedRole =>
																		assignedRole.key === candidateRole.key
																)}
													{#if shouldInclude}
														<input
															name="roleKeys"
															type="hidden"
															value={candidateRole.key}
														/>
													{/if}
												{/each}
												<button
													aria-label={`${isEnabled ? "Disable" : "Enable"} ${role.name} for ${managedUser.fullName}`}
													class={`badge cursor-pointer border-none px-3 py-3 font-bold normal-case transition-colors ${isEnabled ? "badge-primary" : "badge-neutral badge-outline text-base-content/70"}`}
													formaction="?/updateUser"
													title={role.description}
													type="submit"
												>
													{role.name}
												</button>
											</form>
										{/each}
									</div>
								</td>
								<td class="py-5">
									<form method="POST">
										<input name="userId" type="hidden" value={managedUser.id} />
										<input
											name="isActive"
											type="hidden"
											value={managedUser.isActive ? "false" : "true"}
										/>
										<button
											aria-label={`${managedUser.isActive ? "Disable" : "Enable"} ${managedUser.fullName}`}
											class={`badge badge-sm cursor-pointer border-none px-3 py-3 font-bold uppercase ${managedUser.isActive ? "badge-success" : "badge-neutral"}`}
											formaction="?/setAccountStatus"
											type="submit"
										>
											{managedUser.isActive ? "active" : "disabled"}
										</button>
									</form>
								</td>
								<td class="text-base-content/70 py-5 text-sm">
									{formatDate(managedUser.createdAt)}
								</td>
								<td class="text-base-content/70 py-5 text-sm">
									{formatDate(managedUser.lastLoginAt)}
								</td>
								<td class="py-5">
									<div class="flex min-w-24 gap-2">
										<form method="POST">
											<input
												name="userId"
												type="hidden"
												value={managedUser.id}
											/>
											<button
												aria-label={`Generate registration link for ${managedUser.fullName}`}
												class="btn btn-outline h-10 min-h-10 w-10 px-0"
												formaction="?/generateRegistrationLink"
												type="submit"
											>
												<svg
													aria-hidden="true"
													class="h-5 w-5"
													fill="none"
													stroke="currentColor"
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													viewBox="0 0 24 24"
												>
													<circle cx="8.5" cy="15.5" r="3.5" />
													<path d="M11 13l8-8" />
													<path d="M17 5h2v2" />
													<path d="M15 7h2v2" />
												</svg>
												<span class="sr-only">New link</span>
											</button>
										</form>
										<form method="POST">
											<input
												name="userId"
												type="hidden"
												value={managedUser.id}
											/>
											<button
												aria-label={`Remove ${managedUser.fullName}`}
												class="btn btn-error h-10 min-h-10 w-10 px-0"
												formaction="?/deleteUser"
												type="submit"
											>
												<svg
													aria-hidden="true"
													class="h-5 w-5"
													fill="none"
													stroke="currentColor"
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													viewBox="0 0 24 24"
												>
													<path d="M3 6h18" />
													<path d="M8 6V4h8v2" />
													<path d="M19 6l-1 14H6L5 6" />
													<path d="M10 11v6" />
													<path d="M14 11v6" />
												</svg>
												<span class="sr-only">Remove</span>
											</button>
										</form>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</section>
</div>
