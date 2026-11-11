<script lang="ts">
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
			<h1 class="text-2xl font-bold">Hi {data.user.name} 👋</h1>
			<a href="/events/new" class="btn">Plan something</a>
		</div>

		<div class="grid grid-cols-3 gap-3">
			<div class="card text-center">
				<p class="text-3xl font-extrabold">{dash.upcoming.length}</p>
				<p class="text-sm text-zinc-600">Upcoming</p>
			</div>
			<div class="card text-center">
				<p class="text-3xl font-extrabold">{hosting}</p>
				<p class="text-sm text-zinc-600">You’re hosting</p>
			</div>
			<div class="card text-center">
				<p class="text-3xl font-extrabold {todoCount ? 'text-brand-700' : ''}">{todoCount}</p>
				<p class="text-sm text-zinc-600">Waiting on you</p>
			</div>
		</div>

		{#if dash.notifications.length}
			<section>
				<h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Updates</h2>
				<ul class="card divide-y divide-zinc-100 p-0">
					{#each dash.notifications as n (n.id)}
						<li class="flex items-center gap-2 px-5 py-3 text-sm">
							{#if !n.read}<span class="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="New"></span>{/if}
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
	<section class="py-16 text-center">
		<h1 class="text-4xl font-extrabold tracking-tight sm:text-5xl">Who's coming to the gaff?</h1>
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
