<script lang="ts">
	import { enhance } from '$app/forms';
	import { GAMES, GAME_IDS, SETTINGS, SETTING_IDS, type Setting } from '#lib/activities.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const a = $derived(data.activity);
	let soft = $state(false);
	let picking = $state(false);
	let tab = $state<Setting | 'mates'>('gaff');
	const showPicker = $derived(!a || picking);
	const builtIns = $derived(GAME_IDS.map((id) => GAMES[id]).filter((g) => g.setting === tab));
	const outcomes = { done: 'pulled it off', bailed: 'bailed', caught: 'got caught' };
	const startEnhance = () => async ({ update }: { update: () => Promise<void> }) => {
		picking = false;
		await update();
	};
</script>

{#if form?.error}<p class="error mb-5" role="alert">{form.error}</p>{/if}

<div class="space-y-5">
	{#if a}
		<section class="card space-y-4 {a.secret && a.mine ? 'border-hot' : ''}" aria-live="polite">
			<div class="flex flex-wrap items-center gap-2">
				<h2>{a.name}</h2>
				{#if a.soft}<span class="badge text-lime">Soft mode</span>{/if}
				<span class="ml-auto text-xs text-zinc-500">Card {a.number} of {a.total}</span>
			</div>

			{#if a.secret && a.mine}
				<p class="text-sm font-extrabold tracking-widest text-hot uppercase">Secret mission. Only you can see this</p>
			{:else if a.scored && a.player}
				<p class="text-sm font-extrabold tracking-widest text-hot uppercase">{a.player.name}, you’re up!</p>
			{/if}

			<p class="border p-4 text-2xl leading-snug font-black sm:text-3xl {a.secret && a.mine ? 'border-hot' : 'border-lime'}">{a.card}</p>

			{#if a.cover}
				<p class="border border-zinc-200 px-3 py-2 text-sm">
					<span class="font-bold">Everyone else sees:</span> “{a.cover}” Do that openly as your cover.
				</p>
			{/if}
			{#if a.scored && a.points}<p class="text-sm text-zinc-500">Worth {a.points} point{a.points === 1 ? '' : 's'}</p>{/if}
			<p class="text-sm text-zinc-600">{a.rules}</p>

			<div class="flex flex-wrap items-center gap-2">
				{#if a.scored && a.secret && !a.mine}
					<form method="POST" action="?/caught" use:enhance>
						<input type="hidden" name="seen" value={a.position} />
						<button class="btn">Caught {a.player?.name ?? 'them'}</button>
					</form>
				{:else if a.scored}
					<form method="POST" action="?/done" use:enhance>
						<input type="hidden" name="seen" value={a.position} />
						<button class="btn">Done it</button>
					</form>
					<form method="POST" action="?/bail" use:enhance>
						<input type="hidden" name="seen" value={a.position} />
						<button class="btn-secondary">Bailed</button>
					</form>
				{:else}
					<form method="POST" action="?/next" use:enhance>
						<input type="hidden" name="seen" value={a.position} />
						<button class="btn">Next card</button>
					</form>
				{/if}
				{#if a.scored}
					<form method="POST" action="?/next" use:enhance>
						<input type="hidden" name="seen" value={a.position} />
						<button class="btn-secondary">Skip</button>
					</form>
				{/if}
				<button type="button" class="btn-secondary" onclick={() => (picking = !picking)}>{picking ? 'Keep playing' : 'Change game'}</button>
				<form method="POST" action="?/end" use:enhance class="ml-auto">
					<button class="text-xs font-bold tracking-widest text-zinc-500 uppercase hover:text-zinc-900">End game</button>
				</form>
			</div>
			<p class="text-xs text-zinc-500">
				Everyone on this event plays from their own phone and sees the same card{a.secret ? ', apart from secret missions' : ''}. Anyone can move it on.
			</p>
		</section>

		{#if a.reveal}
			<p class="card text-sm" role="status">
				<span class="badge text-hot">Mission revealed</span> {a.reveal.name} {outcomes[a.reveal.outcome]}. The mission was “{a.reveal.mission}”
			</p>
		{/if}
	{/if}

	{#if showPicker}
		<section class="card space-y-4">
			<div class="flex flex-wrap items-start justify-between gap-2">
				<div>
					<h2>{a ? 'Switch game' : 'Start a game'}</h2>
					<p class="text-sm text-zinc-600">Pick one and it shows up on everyone’s phone.</p>
				</div>
				<a class="text-[11px] font-extrabold tracking-widest text-hot uppercase underline underline-offset-4" href="/games">Make your own</a>
			</div>

			<div class="strip [&>*]:px-0.5 [&>*]:tracking-normal sm:[&>*]:tracking-widest" role="tablist" aria-label="Where are you?">
				{#each SETTING_IDS as id (id)}
					<button type="button" role="tab" aria-selected={tab === id} onclick={() => (tab = id)}>
						{SETTINGS[id].label}
					</button>
				{/each}
				<button type="button" role="tab" aria-selected={tab === 'mates'} onclick={() => (tab = 'mates')}>
					Mates{#if data.customGames.length}&nbsp;{data.customGames.length}{/if}
				</button>
			</div>
			{#if tab !== 'mates'}<p class="text-sm text-zinc-500">{SETTINGS[tab].blurb}</p>{/if}

			<label class="flex items-start gap-2 text-sm">
				<input type="checkbox" bind:checked={soft} class="mt-1" />
				<span><strong>Soft mode:</strong> drinks become water or soft drinks, so everyone can play.</span>
			</label>

			<div class="grid border-t border-l border-zinc-200 sm:grid-cols-2 [&>*]:border-r [&>*]:border-b [&>*]:border-zinc-200">
				{#if tab === 'mates'}
					{#each data.customGames as g (g.id)}
						<form method="POST" action="?/start" use:enhance={startEnhance}>
							<input type="hidden" name="game" value="custom:{g.id}" />
							{#if soft}<input type="hidden" name="soft" value="on" />{/if}
							<button class="h-full w-full p-4 text-left hover:bg-zinc-100">
								<span class="block font-extrabold uppercase">{g.name}</span>
								<span class="mt-1 block text-sm text-zinc-600">
									By {g.owner} · {SETTINGS[g.setting].label} · {g.count} cards{g.secrets ? ` · ${g.secrets} secret` : ''}{g.scored ? ' · scored' : ''}
								</span>
							</button>
						</form>
					{:else}
						<p class="text-sm text-zinc-500 sm:col-span-2">
							Nobody on this event has made a game yet. <a class="text-hot underline underline-offset-4" href="/games">Make one</a> and it shows up here for everyone.
						</p>
					{/each}
				{:else}
					{#each builtIns as g (g.id)}
						<form method="POST" action="?/start" use:enhance={startEnhance}>
							<input type="hidden" name="game" value={g.id} />
							{#if soft}<input type="hidden" name="soft" value="on" />{/if}
							<button class="h-full w-full p-4 text-left hover:bg-zinc-100">
								<span class="block font-extrabold uppercase">{g.name}</span>
								<span class="mt-1 block text-sm text-zinc-600">{g.blurb}</span>
							</button>
						</form>
					{/each}
				{/if}
			</div>
		</section>
	{/if}

	{#if data.scores.length}
		<section class="card space-y-3">
			<h2>Leaderboard</h2>
			<ol class="divide-y divide-zinc-200 border border-zinc-200">
				{#each data.scores as s, i (s.id)}
					<li class="flex items-center gap-3 px-3 py-2.5">
						<span class="w-6 text-center font-black {i === 0 ? 'text-lime' : 'text-zinc-500'}">{i + 1}</span>
						<span class="font-semibold">{s.name}</span>
						<span class="text-xs text-zinc-500">{s.done} done · {s.bailed} bailed or caught</span>
						<span class="ml-auto text-xl font-black tabular-nums">{s.points}</span>
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	<p class="text-xs text-zinc-500">
		Games are always optional. Skip any card, switch to water whenever you like, know your limits and look after each other.
		Need advice? <a class="underline" href="https://www.drinkaware.co.uk" target="_blank" rel="noopener noreferrer">drinkaware.co.uk</a>
	</p>
</div>
