<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Who's Gaff</title>
</svelte:head>

<div class="min-h-screen bg-zinc-50 text-zinc-900">
	<header class="border-b border-zinc-200 bg-white">
		<nav class="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
			<a href="/" class="text-lg font-extrabold tracking-tight text-brand-700">Who's Gaff</a>
			{#if data.user}
				<div class="flex items-center gap-3 text-sm">
					<a href="/gaffs" class="hidden text-zinc-600 hover:text-zinc-900 sm:inline">My gaffs</a>
					<a href="/events/new" class="btn btn-small">New event</a>
					<span class="hidden text-zinc-600 sm:inline">{data.user.name}</span>
					<form method="POST" action="/logout">
						<button class="text-zinc-600 hover:text-zinc-900">Log out</button>
					</form>
				</div>
			{:else}
				<div class="flex items-center gap-3 text-sm">
					<a href="/login" class="text-zinc-700 hover:text-zinc-900">Log in</a>
					<a href="/signup" class="btn btn-small">Sign up</a>
				</div>
			{/if}
		</nav>
	</header>
	<main class="mx-auto max-w-4xl px-4 py-6">
		{@render children()}
	</main>
</div>
