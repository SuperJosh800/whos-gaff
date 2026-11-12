<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { formatWhen } from '#lib/time.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	const event = $derived(data.event);
	const host = $derived(data.attendees.find((a) => a.is_host));
	const base = $derived(`/events/${event.id}`);
	const tabs = $derived([
		{ href: base, label: 'Overview' },
		{ href: `${base}/gaff`, label: 'Gaff' },
		{ href: `${base}/night`, label: 'Night' },
		{ href: `${base}/money`, label: 'Money' },
		{ href: `${base}/after`, label: 'After' }
	]);

	async function openChat() {
		if (page.url.pathname !== base) await goto(base);
		const input = document.querySelector<HTMLTextAreaElement>('#chat textarea');
		input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		input?.focus({ preventScroll: true });
	}

	// Reload this page's data whenever someone else changes the event. An update that arrives
	// while a reload is in flight triggers one more reload, since the in-flight one may predate it.
	$effect(() => {
		const id = event.id;
		let reloading = false;
		let again = false;
		const source = new EventSource(`/events/${id}/live`);
		source.onmessage = async () => {
			if (reloading) {
				again = true;
				return;
			}
			reloading = true;
			do {
				again = false;
				await invalidate(`event:${id}`);
			} while (again);
			reloading = false;
		};
		return () => source.close();
	});
</script>

<svelte:head><title>{event.title} · Who's Gaff</title></svelte:head>

<div class="space-y-5">
	<section>
		<div class="flex flex-wrap items-center gap-2">
			<h1 class="text-4xl sm:text-5xl">{event.title}</h1>
			{#if event.starts_at}
				<span class="badge text-lime">Date locked</span>
			{:else if data.votingOpen}
				<span class="badge text-hot">Voting open</span>
			{:else}
				<span class="badge text-zinc-500">Voting closed</span>
			{/if}
			<button type="button" class="btn-secondary btn-small ml-auto" onclick={openChat}>💬 Message</button>
		</div>
		<p class="mt-1 text-zinc-600">
			Hosted by {host?.name}
			· {event.starts_at ? formatWhen(event.starts_at) : 'Date to be decided'}
			{#if data.address}
				· {data.address}
			{:else if data.addressLocked}
				· <span class="text-zinc-500">🔒 Address shown once you RSVP “going”</span>
			{/if}
		</p>
		{#if event.details}<p class="mt-3 whitespace-pre-line">{event.details}</p>{/if}
		{#if event.playlist_url}
			<a href={event.playlist_url} target="_blank" rel="noopener noreferrer"
				class="mt-3 inline-flex items-center gap-2 border border-[#1DB954] px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-[#1DB954] hover:brightness-95">
				🎵 Open the playlist on Spotify
			</a>
		{/if}
	</section>

	<nav class="grid grid-cols-5 border border-zinc-200" aria-label="Event sections">
		{#each tabs as tab (tab.href)}
			<a href={tab.href} aria-current={page.url.pathname === tab.href ? 'page' : undefined}
				class="border-l border-zinc-200 py-2.5 text-center text-[11px] font-extrabold tracking-wide uppercase first:border-l-0 sm:text-xs sm:tracking-widest {page.url.pathname === tab.href
					? 'bg-hot text-ink'
					: 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}">
				{tab.label}
			</a>
		{/each}
	</nav>

	{@render children()}
</div>
