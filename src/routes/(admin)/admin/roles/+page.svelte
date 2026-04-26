<script lang="ts">
	import type { PageProps } from "./$types"

	let { data, form }: PageProps = $props()

	function formatDate(value: string) {
		return new Intl.DateTimeFormat("en-US", {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(value))
	}

	const adminRoles = $derived(
		data.roles.filter(role => role.isAdminRole).length
	)
</script>

<svelte:head>
	<title>Role Management</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<p
			class="text-base-content/60 text-xs font-extrabold tracking-[0.16em] uppercase"
		>
			Admin
		</p>
		<h2 class="text-base-content mt-2 text-4xl font-black tracking-[-0.05em]">
			Role management
		</h2>
	</div>

	{#if form?.message}
		<div
			class="alert alert-info bg-primary/10 text-primary border-primary/10 rounded-2xl text-sm"
		>
			{form.message}
		</div>
	{/if}

	<div
		class="stats stats-vertical bg-base-100 border-base-300 md:stats-horizontal grid gap-4 border shadow-sm md:grid-cols-2"
	>
		<div class="stat">
			<div class="stat-title">Total roles</div>
			<div class="stat-value text-base-content text-3xl">
				{data.roles.length}
			</div>
		</div>
		<div class="stat">
			<div class="stat-title">Admin roles</div>
			<div class="stat-value text-base-content text-3xl">{adminRoles}</div>
		</div>
	</div>

	<div class="collapse-arrow bg-base-100 border-base-300 collapse border">
		<input type="checkbox" />
		<div
			class="collapse-title text-base-content text-2xl font-black tracking-[-0.04em]"
		>
			Create new role
		</div>
		<div class="collapse-content">
			<form class="grid gap-4 md:grid-cols-2" method="POST">
				<label class="form-control">
					<span
						class="label-text text-base-content/60 text-xs font-extrabold tracking-[0.12em] uppercase"
					>
						Role name
					</span>
					<input
						class="input input-bordered bg-base-200 mt-2 w-full rounded-xl"
						name="name"
						required
						type="text"
					/>
				</label>

				<label class="form-control">
					<span
						class="label-text text-base-content/60 text-xs font-extrabold tracking-[0.12em] uppercase"
					>
						Description
					</span>
					<input
						class="input input-bordered bg-base-200 mt-2 w-full rounded-xl"
						name="description"
						type="text"
					/>
				</label>

				<div class="md:col-span-2">
					<button
						class="btn btn-primary text-xs font-bold tracking-[0.16em] uppercase"
						formaction="?/createRole"
						type="submit"
					>
						Create role
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
				Role list
			</p>
			<div class="mt-5 overflow-x-auto">
				<table class="table-pin-rows table min-w-260">
					<thead>
						<tr class="text-base-content/60">
							<th>Key</th>
							<th>Name</th>
							<th>Description</th>
							<th>Assigned users</th>
							<th>Created</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each data.roles as role (role.key)}
							{@const formId = `role-form-${role.key}`}
							<tr class="border-b border-[rgba(212,195,189,0.22)] align-top">
								<td class="py-5">
									<p class="text-base-content/60 pt-2 text-xs uppercase">
										{role.key}
									</p>
								</td>
								<td class="py-5">
									<label class="form-control min-w-44">
										<input
											class="input input-bordered bg-base-200 h-10 min-h-10 w-full text-sm"
											form={formId}
											name="name"
											required
											type="text"
											value={role.name}
										/>
									</label>
								</td>
								<td class="py-5">
									<label class="form-control min-w-md">
										<input
											class="input input-bordered bg-base-200 h-10 min-h-10 w-full text-sm"
											form={formId}
											name="description"
											type="text"
											value={role.description}
										/>
									</label>
								</td>
								<td class="py-5">
									<div class="flex min-w-36 flex-col gap-3">
										<div class="badge badge-neutral badge-lg">
											{role.userCount} users
										</div>
									</div>
								</td>
								<td class="text-base-content/70 py-5 text-sm">
									{formatDate(role.createdAt)}
								</td>
								<td class="py-5">
									<div class="flex min-w-32 items-center gap-2">
										<form id={formId} method="POST">
											<input name="roleKey" type="hidden" value={role.key} />
										</form>
										<button
											aria-label={`Save ${role.name}`}
											class="btn btn-primary h-10 min-h-10 w-10 px-0"
											disabled={role.isAdminRole}
											form={formId}
											formaction="?/updateRole"
											type="submit"
										>
											<svg
												aria-hidden="true"
												class="h-4 w-4"
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
											<span class="sr-only">Save</span>
										</button>
										<form method="POST">
											<input name="roleKey" type="hidden" value={role.key} />
											<button
												aria-label={`Delete ${role.name}`}
												class="btn btn-error h-10 min-h-10 w-10 px-0"
												disabled={role.isSystem ||
													role.isAdminRole ||
													role.userCount > 0}
												formaction="?/deleteRole"
												type="submit"
											>
												<svg
													aria-hidden="true"
													class="h-4 w-4"
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
												<span class="sr-only">Delete</span>
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
