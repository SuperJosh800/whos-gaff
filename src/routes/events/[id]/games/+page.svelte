<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { GAMES, GAME_IDS } from '#lib/activities.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const activity = $derived(data.activity);
	const game = $derived(activity ? GAMES[activity.game] : null);
	const me = $derived(page.data.user?.id);
	let soft = $state(false);
	let picking = $state(false);
	const showPicker = $derived(!activity || picking);
</script>

{#if form?.error}<p class="error mb-5" role="alert">{form.error}</p>{/if}

<div class="space-y-5">
	{#if activity && game}
		<section class="card space-y-4" aria-live="polite">
			<div class="flex flex-wrap items-center gap-2">
				<h2 class="text-lg font-bold">{game.emoji} {game.name}</h2>
				{#if activity.soft}<span class="badge text-lime">Soft mode</span>{/if}
				<span class="ml-auto text-xs text-zinc-500">Card {activity.number} of {activity.total}</span>
			</div>

			{#if activity.game === 'challenges'}
				<p class="text-sm font-extrabold tracking-widest text-hot uppercase">
					{activity.target ? (activity.target.id === me ? 'You’re up!' : `${activity.target.name}, you’re up!`) : 'Get people to RSVP to play'}
				</p>
			{/if}
			<p class="border-l-4 border-lime py-2 pl-4 text-2xl leading-snug font-bold sm:text-3xl">{activity.card}</p>
			{#if activity.points}<p class="text-sm text-zinc-500">Worth {activity.points} point{activity.points === 1 ? '' : 's'}</p>{/if}
			<p class="text-sm text-zinc-600">{activity.soft ? game.softRules : game.rules}</p>

			<div class="flex flex-wrap gap-2">
				{#if activity.game === 'challenges'}
					<form method="POST" action="?/done" use:enhance>
						<input type="hidden" name="seen" value={activity.position} />
						<button class="btn">✅ Done it</button>
					</form>
					<form method="POST" action="?/bail" use:enhance>
						<input type="hidden" name="seen" value={activity.position} />
						<button class="btn-secondary">🐔 Bailed</button>
					</form>
				{:else}
					<form method="POST" action="?/next" use:enhance>
						<input type="hidden" name="seen" value={activity.position} />
						<button class="btn">Next card →</button>
					</form>
				{/if}
				<button type="button" class="btn-secondary" onclick={() => (picking = !picking)}>{picking ? 'Keep playing' : 'Change game'}</button>
				<form method="POST" action="?/end" use:enhance class="ml-auto">
					<button class="text-xs font-bold tracking-widest text-zinc-500 uppercase hover:text-zinc-900">End game</button>
				</form>
			</div>
			<p class="text-xs text-zinc-500">Everyone on this event sees the same card. Anyone can move it on.</p>
		</section>
	{/if}

	{#if showPicker}
		<section class="card space-y-4">
			<div>
				<h2 class="text-lg font-bold">{activity ? 'Switch game' : 'Start a game'}</h2>
				<p class="text-sm text-zinc-600">Pick one and it shows up on everyone’s phone.</p>
			</div>
			<label class="flex items-start gap-2 text-sm">
				<input type="checkbox" bind:checked={soft} class="mt-1" />
				<span><strong>Soft mode:</strong> no drinking in the rules. Forfeits and points instead, so everyone can play.</span>
			</label>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each GAME_IDS as id (id)}
					{@const g = GAMES[id]}
					<form method="POST" action="?/start" use:enhance={() => async ({ update }) => { picking = false; await update(); }}>
						<input type="hidden" name="game" value={id} />
						{#if soft}<input type="hidden" name="soft" value="on" />{/if}
						<button class="h-full w-full border border-zinc-200 p-4 text-left transition hover:border-lime">
							<span class="block text-lg font-bold">{g.emoji} {g.name}</span>
							<span class="mt-1 block text-sm text-zinc-600">{g.blurb}</span>
						</button>
					</form>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.scores.length}
		<section class="card space-y-3">
			<h2 class="text-lg font-bold">🏆 Challenge leaderboard</h2>
			<ol class="space-y-2">
				{#each data.scores as s, i (s.id)}
					<li class="flex items-center gap-3">
						<span class="w-6 text-center font-black {i === 0 ? 'text-lime' : 'text-zinc-500'}">{i + 1}</span>
						<span class="font-semibold">{s.name}</span>
						<span class="text-xs text-zinc-500">{s.done} done · {s.bailed} bailed</span>
						<span class="ml-auto text-xl font-black tabular-nums">{s.points}</span>
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	<p class="text-xs text-zinc-500">
		Games are always optional. Skip any card, switch to water whenever you like, and look after each other.
		Need advice? <a class="underline" href="https://www.drinkaware.co.uk" target="_blank" rel="noopener noreferrer">drinkaware.co.uk</a>
	</p>
</div>
