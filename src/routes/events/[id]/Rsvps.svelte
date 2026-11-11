<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const me = $derived(data.attendees.find((a) => a.id === page.data.user?.id));
	const groups = $derived([
		{ label: 'Going', key: 'yes', tone: 'text-emerald-700' },
		{ label: 'Maybe', key: 'maybe', tone: 'text-amber-700' },
		{ label: "Can't go", key: 'no', tone: 'text-red-700' },
		{ label: 'No reply yet', key: null, tone: 'text-zinc-500' }
	].map((g) => ({ ...g, people: data.attendees.filter((a) => a.response === g.key) })));
	const choices = [
		{ value: 'yes', label: "I'm going", on: 'bg-emerald-600 text-white border-emerald-600' },
		{ value: 'maybe', label: 'Maybe', on: 'bg-amber-500 text-white border-amber-500' },
		{ value: 'no', label: "Can't go", on: 'bg-red-600 text-white border-red-600' }
	];
</script>

<section class="card space-y-4">
	<h2 class="text-lg font-bold">Are you coming?</h2>
	<form method="POST" action="?/rsvp" use:enhance class="flex flex-wrap gap-2">
		{#each choices as c (c.value)}
			<button name="response" value={c.value} aria-pressed={me?.response === c.value}
				class="rounded-xl border px-4 py-2 text-sm font-semibold transition {me?.response === c.value ? c.on : 'border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50'}">
				{c.label}
			</button>
		{/each}
	</form>

	<div class="grid gap-3 border-t border-zinc-100 pt-4 sm:grid-cols-4">
		{#each groups as g (g.label)}
			<div>
				<p class="text-sm font-semibold {g.tone}">{g.label} · {g.people.length}</p>
				<ul class="mt-1 space-y-0.5 text-sm text-zinc-700">
					{#each g.people as p (p.id)}<li><a class="hover:underline" href="/people/{p.id}">{p.name}</a>{p.is_host ? ' (host)' : ''}</li>{/each}
				</ul>
			</div>
		{/each}
	</div>
	{#if data.pendingInvites.length}
		<p class="text-sm text-zinc-500">
			Invited by email, not joined yet: {data.pendingInvites.join(', ')}
		</p>
	{/if}
</section>
