<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const links = [
		{ href: '/', label: 'Events', match: (p: string) => p === '/' || (p.startsWith('/events/') && p !== '/events/new') },
		{ href: '/groups', label: 'Groups', match: (p: string) => p.startsWith('/groups') },
		{ href: '/gaffs', label: 'Gaffs', match: (p: string) => p.startsWith('/gaffs') },
		{ href: '/profile', label: 'Me', match: (p: string) => p.startsWith('/profile') }
	];
	const path = $derived(page.url.pathname);
	const current = (link: (typeof links)[number]) => (link.match(path) ? 'page' : undefined);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Who's Gaff</title>
</svelte:head>

<div class="min-h-screen bg-ink text-zinc-900">
	<header class="sticky top-0 z-20 border-b border-zinc-200 bg-ink/95 backdrop-blur">
		<nav class="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3" aria-label="Main">
			<a href="/" class="text-lg font-black tracking-wide whitespace-nowrap text-lime uppercase">Who's Gaff</a>
			{#if data.user}
				<div class="hidden items-center gap-5 sm:flex">
					{#each links as link (link.href)}
						<a href={link.href} aria-current={current(link)}
							class="relative py-1 text-xs font-extrabold tracking-widest whitespace-nowrap uppercase {current(link)
								? 'text-lime after:absolute after:inset-x-0 after:-bottom-[13px] after:h-0.5 after:bg-lime'
								: 'text-zinc-500 hover:text-zinc-900'}">
							{link.label === 'Me' ? data.user.name : link.label}
						</a>
					{/each}
				</div>
				<div class="ml-auto flex items-center gap-4">
					<a href="/events/new" class="btn btn-small" aria-current={path === '/events/new' ? 'page' : undefined}>+ New event</a>
					<form method="POST" action="/logout" class="hidden sm:block">
						<button class="text-xs font-bold tracking-widest text-zinc-500 uppercase hover:text-zinc-900">Log out</button>
					</form>
				</div>
			{:else}
				<div class="ml-auto flex items-center gap-4 whitespace-nowrap">
					<a href="/login" class="text-xs font-extrabold tracking-widest text-zinc-600 uppercase hover:text-zinc-900">Log in</a>
					<a href="/signup" class="btn btn-small">Sign up</a>
				</div>
			{/if}
		</nav>
	</header>
	<main class="mx-auto max-w-4xl px-4 py-6 {data.user ? 'pb-24 sm:pb-6' : ''}">
		{@render children()}
	</main>
	{#if data.user}
		<!-- Phones: the main sections sit in a tab bar under your thumb. -->
		<nav class="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-zinc-200 bg-ink pb-[env(safe-area-inset-bottom)] sm:hidden" aria-label="Main">
			{#each links as link (link.href)}
				<a href={link.href} aria-current={current(link)}
					class="border-l border-zinc-200 py-4 text-center text-[11px] font-extrabold tracking-widest uppercase first:border-l-0 {current(link)
						? 'bg-lime text-ink'
						: 'text-zinc-500'}">
					{link.label}
				</a>
			{/each}
		</nav>
	{/if}
</div>
