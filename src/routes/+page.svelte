<script lang="ts">
	import { page } from '$app/state';
	import EventCard from './EventCard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const dash = $derived(data.dashboard);
	const todoCount = $derived(dash?.upcoming.filter((e) => e.todo).length ?? 0);
	const hosting = $derived(dash?.upcoming.filter((e) => e.is_host).length ?? 0);
</script>

{#if data.user && dash}
	<div class="space-y-6">
		<div class="flex flex-wrap items-end justify-between gap-3">
			<h1 class="text-4xl sm:text-5xl">Hi {data.user.name}</h1>
			<a href="/events/new" class="btn">Plan something</a>
		</div>

		<div class="grid grid-cols-3 gap-3">
			<div class="stat border-l-2 border-zinc-300 pl-3"><b class="!text-4xl">{dash.upcoming.length}</b><span>Upcoming</span></div>
			<div class="stat border-l-2 border-zinc-300 pl-3"><b class="!text-4xl">{hosting}</b><span>You’re hosting</span></div>
			<div class="stat border-l-2 pl-3 {todoCount ? 'border-hot' : 'border-zinc-300'}"><b class="!text-4xl {todoCount ? '!text-hot' : ''}">{todoCount}</b><span>Waiting on you</span></div>
		</div>

		{#if dash.notifications.length}
			<section>
				<h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Updates</h2>
				<ul class="card divide-y divide-zinc-100 p-0">
					{#each dash.notifications as n (n.id)}
						<li class="flex items-center gap-2 px-5 py-3 text-sm">
							{#if !n.read}<span class="h-2 w-2 shrink-0 bg-brand-600" aria-label="New"></span>{/if}
							{#if n.event_id}
								<a href="/events/{n.event_id}" class="hover:underline">{n.message}</a>
							{:else}
								{n.message}
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section>
			<h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Upcoming</h2>
			{#if dash.upcoming.length}
				<div class="grid gap-3 sm:grid-cols-2">
					{#each dash.upcoming as event (event.id)}<EventCard {event} />{/each}
				</div>
			{:else}
				<p class="card text-zinc-600">
					Nothing planned yet. <a class="font-semibold text-brand-700" href="/events/new">Start something</a>.
				</p>
			{/if}
		</section>

		{#if dash.past.length}
			<section>
				<h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Past</h2>
				<div class="grid gap-3 opacity-80 sm:grid-cols-2">
					{#each dash.past as event (event.id)}<EventCard {event} />{/each}
				</div>
			</section>
		{/if}
	</div>
{:else}
	{#if page.url.searchParams.has('deleted')}
		<p class="card mx-auto max-w-lg text-center" role="status">Your account has been deleted. Thanks for using Who’s Gaff.</p>
	{/if}
	<section class="py-16 text-center">
		<h1 class="text-5xl sm:text-7xl">Who's coming to the gaff?</h1>
		<p class="mx-auto mt-4 max-w-xl text-lg text-zinc-600">
			Pick a date everyone can do, get RSVPs, and see who's actually turning up, without scrolling
			back through the group chat.
		</p>
		<div class="mt-8 flex justify-center gap-3">
			<a href="/signup" class="btn">Get started</a>
			<a href="/login" class="btn-secondary">Log in</a>
		</div>
	</section>
{/if}
