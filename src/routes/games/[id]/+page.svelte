<script lang="ts">
	import GameForm from '../GameForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Edit {data.game.name} · Who's Gaff</title></svelte:head>

<div class="mx-auto max-w-2xl space-y-5">
	<a class="text-sm font-semibold text-brand-700" href="/games">← Your games</a>
	<h1 class="text-3xl font-bold">Edit {data.game.name}</h1>
	<p class="text-sm text-zinc-500">Changes apply the next time someone starts the game. A game already running keeps its cards.</p>
	<GameForm values={form?.values ?? data.game} error={form?.error} submit="Save changes" reset={false} />
</div>
