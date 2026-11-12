<script lang="ts">
	import { enhance } from '$app/forms';
	import { SETTINGS } from '#lib/activities.ts';
	import GameForm from './GameForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Your games · Who's Gaff</title></svelte:head>

<div class="mx-auto max-w-2xl space-y-5">
	<div>
		<h1 class="text-3xl font-bold">Your drinking games</h1>
		<p class="mt-1 text-zinc-600">Make your own deck. It shows up in the Games tab of every event you’re on, for everyone there to play.</p>
	</div>

	{#if data.games.length}
		<ul class="space-y-2">
			{#each data.games as g (g.id)}
				<li class="card flex flex-wrap items-center gap-3 py-3">
					<span class="text-2xl" aria-hidden="true">{g.emoji}</span>
					<div class="min-w-0 flex-1">
						<a class="font-bold hover:text-lime" href="/games/{g.id}">{g.name}</a>
						<p class="text-xs text-zinc-500">
							{SETTINGS[g.setting].label} · {g.cards.length} cards{g.cards.some((c) => c.secret) ? ` · ${g.cards.filter((c) => c.secret).length} secret` : ''}{g.scored ? ' · scored' : ''}
						</p>
					</div>
					<a class="btn-secondary btn-small" href="/games/{g.id}">Edit</a>
					<form method="POST" action="?/delete" use:enhance={({ cancel }) => { if (!confirm(`Delete ${g.name}?`)) cancel(); }}>
						<input type="hidden" name="id" value={g.id} />
						<button class="text-xs text-red-700 underline">Delete</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}

	<h2 class="text-xl font-bold">Make a game</h2>
	{#if form && 'saved' in form}<p class="text-sm text-emerald-700" role="status">Saved! It’s in the Games tab of your events.</p>{/if}
	<GameForm values={form && 'values' in form ? form.values : undefined} error={form?.error} submit="Save game" />
</div>
