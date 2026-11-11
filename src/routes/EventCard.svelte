<script lang="ts">
	import { formatWhen } from '#lib/time.ts';
	import type { DashboardEvent } from '#lib/server/dashboard.ts';

	let { event }: { event: DashboardEvent } = $props();

	const badges = {
		voting: ['Voting open', 'text-hot'],
		'voting-closed': ['Voting closed', 'text-zinc-500'],
		locked: ['Date locked', 'text-lime'],
		past: ['Done', 'text-zinc-500']
	} as const;
	const todos = { vote: 'Vote on dates', rsvp: 'RSVP', pick: 'Pick a date' } as const;
	const noReply = $derived(event.invited - event.going - event.maybe - event.not_going);
</script>

<a href="/events/{event.id}" class="card block transition hover:border-hot">
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h3 class="truncate text-lg font-black uppercase">{event.title}</h3>
			<p class="text-sm text-zinc-600">
				{event.is_host ? 'You’re hosting' : `Hosted by ${event.host_name}`}
				· {event.starts_at ? formatWhen(event.starts_at) : 'Date TBC'}
			</p>
		</div>
		<span class="badge shrink-0 {badges[event.status][1]}">{badges[event.status][0]}</span>
	</div>

	<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
		{#if event.starts_at}
			<span class="font-semibold text-emerald-700">{event.going} going</span>
			<span class="text-amber-700">{event.maybe} maybe</span>
			<span class="text-red-700">{event.not_going} can't</span>
			<span class="text-zinc-500">{noReply} no reply</span>
		{:else}
			<span class="text-zinc-700">{event.voters} of {event.invited} voted</span>
			{#if event.vote_deadline && event.status === 'voting'}
				<span class="text-zinc-500">Vote by {formatWhen(event.vote_deadline)}</span>
			{/if}
		{/if}
		{#if event.todo}
			<span class="badge ml-auto bg-hot text-ink">{todos[event.todo]}</span>
		{/if}
	</div>
</a>
