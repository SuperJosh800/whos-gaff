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
		{ value: 'yes', label: "I'm going", on: 'bg-lime text-ink border-lime' },
		{ value: 'maybe', label: 'Maybe', on: '!bg-amber-500' },
		{ value: 'no', label: "Can't go", on: '!bg-hot' }
	];
</script>

<section class="card space-y-4">
	<h2>Are you coming?</h2>
	<form method="POST" action="?/rsvp" use:enhance class="strip">
		{#each choices as c (c.value)}
			<button name="response" value={c.value} aria-pressed={me?.response === c.value} class={me?.response === c.value ? c.on : ''}>
				{c.label}
			</button>
		{/each}
	</form>

	<div class="grid grid-cols-2 border border-zinc-200 sm:grid-cols-4">
		{#each groups as g, i (g.label)}
			<div class="border-zinc-200 p-3 {i % 2 ? 'border-l' : ''} {i > 1 ? 'border-t sm:border-t-0' : ''} {i === 2 ? 'sm:border-l' : ''}">
				<p class="text-[11px] font-extrabold tracking-widest uppercase {g.tone}">{g.label}</p>
				<p class="text-2xl leading-none font-black">{g.people.length}</p>
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
