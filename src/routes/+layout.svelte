<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const links = [
		{ href: '/', label: 'Events', icon: '🎉', match: (p: string) => p === '/' || (p.startsWith('/events/') && p !== '/events/new') },
		{ href: '/groups', label: 'Groups', icon: '👥', match: (p: string) => p.startsWith('/groups') },
		{ href: '/gaffs', label: 'Gaffs', icon: '🏠', match: (p: string) => p.startsWith('/gaffs') },
		{ href: '/profile', label: 'Me', icon: '🙂', match: (p: string) => p.startsWith('/profile') }
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
	<main class="mx-auto max-w-4xl px-4 py-6 {data.user ? 'pb-28 sm:pb-6' : ''}">
		{@render children()}
		<footer class="mt-12 flex flex-wrap gap-x-5 gap-y-1 border-t border-zinc-200 pt-4 text-xs text-zinc-500">
			<a class="hover:text-zinc-900" href="/privacy">Privacy</a>
			<a class="hover:text-zinc-900" href="/terms">Terms</a>
			<span>18+ · Please drink responsibly · <a class="underline hover:text-zinc-900" href="https://www.drinkaware.co.uk" target="_blank" rel="noopener noreferrer">drinkaware.co.uk</a></span>
		</footer>
	</main>
	{#if data.user}
		<!-- Phones: the main sections sit in a tab bar under your thumb. -->
		<nav class="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-zinc-200 bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden" aria-label="Main">
			{#each links as link (link.href)}
				<a href={link.href} aria-current={current(link)}
					class="flex flex-col items-center gap-0.5 border-t-2 py-2 text-[11px] font-extrabold tracking-wider uppercase {current(link)
						? 'border-lime text-lime'
						: 'border-transparent text-zinc-500'}">
					<span class="text-lg leading-none" aria-hidden="true">{link.icon}</span>{link.label}
				</a>
			{/each}
		</nav>
	{/if}
</div>
