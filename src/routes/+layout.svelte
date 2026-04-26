<script lang="ts">
	import "$lib/styles/theme.css"
	import type { LayoutProps } from "./$types"

	let { children }: LayoutProps = $props()
</script>

{@render children()}
