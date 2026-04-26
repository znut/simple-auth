<script lang="ts">
	import { resolve } from "$app/paths"
	import { page } from "$app/stores"

	export let data: {
		appName: string
		user: {
			fullName: string
			role: string
			roleName: string
			roles: {
				key: string
				name: string
			}[]
		}
	}

	const navItems = [
		{ href: "/admin", label: "Users" },
		{ href: "/admin/roles", label: "Roles" },
	] as const
	const signOutHref = "/api/auth/logout?next=/"

	function isNavItemActive(href: string, pathname: string) {
		if (href === "/admin") {
			return pathname === href
		}

		return pathname.startsWith(href)
	}
</script>

<div class="page-wrap min-h-screen">
	<div class="mx-auto flex min-h-screen max-w-450 flex-col lg:flex-row">
		<aside
			class="bg-base-100/80 border-base-300 px-6 py-8 backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-r"
		>
			<div class="flex items-start gap-3">
				<div
					class="bg-primary text-primary-content flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-black"
				>
					C
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="text-primary text-lg font-black tracking-[-0.05em]">
								{data.appName}
							</p>
							<p
								class="text-base-content mt-1 truncate text-base font-black tracking-[-0.02em]"
							>
								{data.user.fullName}
							</p>
							<p
								class="mt-1 text-[0.7rem] tracking-[0.12em] text-[color:var(--stitch-surface-muted)] uppercase"
							>
								{data.user.roleName}
							</p>
						</div>
						<form action={signOutHref} class="shrink-0" method="GET">
							<button
								aria-label="Sign out"
								class="btn btn-ghost text-primary hover:bg-base-200 h-9 min-h-9 w-9 px-0"
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
									<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
									<path d="M16 17l5-5-5-5" />
									<path d="M21 12H9" />
								</svg>
								<span class="sr-only">Sign out</span>
							</button>
						</form>
					</div>
				</div>
			</div>

			<nav class="mt-10 flex flex-col gap-1">
				{#each navItems as item (item.href)}
					<a
						class={`btn justify-start gap-3 border-none px-4 text-xs font-bold tracking-[0.12em] uppercase ${isNavItemActive(item.href, $page.url.pathname) ? "btn-primary" : "btn-ghost text-base-content/70 hover:bg-base-200"}`}
						href={resolve(item.href)}
					>
						<span class="h-2.5 w-2.5 rounded-full bg-current/50"></span>
						<span>{item.label}</span>
					</a>
				{/each}
			</nav>

			<form action={signOutHref} class="mt-6" method="GET">
				<button
					class="btn btn-ghost text-base-content/70 hover:bg-base-200 w-full justify-start gap-3 border-none px-4 text-xs font-bold tracking-[0.12em] uppercase"
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
						<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
						<path d="M16 17l5-5-5-5" />
						<path d="M21 12H9" />
					</svg>
					<span>Sign out</span>
				</button>
			</form>
		</aside>

		<div class="flex-1 px-5 py-6 md:px-8 lg:px-10 lg:py-8">
			<slot />
		</div>
	</div>
</div>
