<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { formatWhen } from '#lib/time.ts';
	import Poll from './Poll.svelte';
	import Rsvps from './Rsvps.svelte';
	import Invite from './Invite.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const event = $derived(data.event);
	const host = $derived(data.attendees.find((a) => a.is_host));

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
			<h1 class="text-3xl font-extrabold tracking-tight">{event.title}</h1>
			{#if event.starts_at}
				<span class="badge bg-emerald-100 text-emerald-800">Date locked</span>
			{:else if data.votingOpen}
				<span class="badge bg-amber-100 text-amber-800">Voting open</span>
			{:else}
				<span class="badge bg-zinc-200 text-zinc-700">Voting closed</span>
			{/if}
		</div>
		<p class="mt-1 text-zinc-600">
			Hosted by {host?.name}
			· {event.starts_at ? formatWhen(event.starts_at) : 'Date to be decided'}
			{#if event.location}· {event.location}{/if}
		</p>
		{#if event.details}<p class="mt-3 whitespace-pre-line">{event.details}</p>{/if}
	</section>

	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

	{#if event.starts_at}
		<Rsvps {data} />
	{:else}
		<Poll {data} />
	{/if}

	{#if data.isHost}
		<Invite {data} invited={form && 'invited' in form ? form.invited : undefined} />
	{/if}
</div>
