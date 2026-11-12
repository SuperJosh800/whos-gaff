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
		{ href: `${base}/games`, label: 'Games' },
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
	<section class="space-y-3">
		<h1 class="text-4xl sm:text-5xl">{event.title}</h1>
		<div class="grid grid-cols-[1fr_auto_auto] border border-zinc-200 text-sm">
			<p class="min-w-0 px-3 py-2.5 text-zinc-700">
				<span class="text-zinc-900">{host?.name}</span> hosting,
				{event.starts_at ? formatWhen(event.starts_at) : 'date to be decided'}
			</p>
			{#if event.starts_at}
				<span class="badge border-l border-zinc-200 px-3 text-lime">Date locked</span>
			{:else if data.votingOpen}
				<span class="badge border-l border-zinc-200 px-3 text-hot">Voting open</span>
			{:else}
				<span class="badge border-l border-zinc-200 px-3 text-zinc-500">Voting closed</span>
			{/if}
			<button type="button" class="border-l border-zinc-200 px-3 text-[11px] font-extrabold tracking-widest uppercase hover:bg-zinc-100" onclick={openChat}>Message</button>
		</div>
		{#if data.address || data.addressLocked}
			<p class="text-sm {data.address ? 'text-zinc-700' : 'text-zinc-500'}">
				{data.address ?? 'The address shows once you RSVP “going”.'}
			</p>
		{/if}
		{#if event.details}<p class="whitespace-pre-line">{event.details}</p>{/if}
		{#if event.playlist_url}
			<a href={event.playlist_url} target="_blank" rel="noopener noreferrer"
				class="inline-block text-xs font-extrabold tracking-widest text-[#1DB954] uppercase underline underline-offset-4">
				Playlist on Spotify
			</a>
		{/if}
	</section>

	<nav class="strip [&>*]:px-0.5 [&>*]:text-[10px] [&>*]:tracking-normal min-[400px]:[&>*]:text-[11px] sm:[&>*]:text-xs sm:[&>*]:tracking-widest" aria-label="Event sections">
		{#each tabs as tab (tab.href)}
			<a href={tab.href} aria-current={page.url.pathname === tab.href ? 'page' : undefined}>{tab.label}</a>
		{/each}
	</nav>

	{#if data.gameOn && page.url.pathname !== `${base}/games`}
		<a href="{base}/games" class="grid grid-cols-[1fr_auto] border border-lime text-sm hover:bg-zinc-100">
			<span class="px-3 py-2.5"><span class="badge text-lime">Game on</span> {data.gameOn.name}</span>
			<span class="flex items-center bg-lime px-3 text-[11px] font-extrabold tracking-widest text-ink uppercase">Join in</span>
		</a>
	{/if}

	{@render children()}
</div>
