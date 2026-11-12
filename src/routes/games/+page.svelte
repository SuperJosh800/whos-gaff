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
		<h1 class="text-4xl">Your drinking games</h1>
		<p class="mt-1 text-zinc-600">Make your own deck. It shows up in the Games tab of every event you’re on, for everyone there to play.</p>
	</div>

	{#if data.games.length}
		<ul class="divide-y divide-zinc-200 border border-zinc-200">
			{#each data.games as g (g.id)}
				<li class="flex flex-wrap items-center gap-3 px-3 py-2.5">
					<div class="min-w-0 flex-1">
						<a class="font-extrabold uppercase hover:text-lime" href="/games/{g.id}">{g.name}</a>
						<p class="text-xs text-zinc-500">
							{SETTINGS[g.setting].label} · {g.cards.length} cards{g.cards.some((c) => c.secret) ? ` · ${g.cards.filter((c) => c.secret).length} secret` : ''}{g.scored ? ' · scored' : ''}
						</p>
					</div>
					<a class="text-[11px] font-extrabold tracking-widest text-hot uppercase underline underline-offset-4" href="/games/{g.id}">Edit</a>
					<form method="POST" action="?/delete" use:enhance={({ cancel }) => { if (!confirm(`Delete ${g.name}?`)) cancel(); }}>
						<input type="hidden" name="id" value={g.id} />
						<button class="h-8 w-8 text-lg text-zinc-500 hover:text-hot" aria-label="Delete {g.name}">×</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}

	<h2>Make a game</h2>
	{#if form && 'saved' in form}<p class="text-sm text-emerald-700" role="status">Saved! It’s in the Games tab of your events.</p>{/if}
	<GameForm values={form && 'values' in form ? form.values : undefined} error={form?.error} submit="Save game" />
</div>
