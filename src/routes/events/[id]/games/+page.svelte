<script lang="ts">
	import { enhance } from '$app/forms';
	import { GAMES, GAME_IDS, SETTINGS, SETTING_IDS, type Setting } from '#lib/activities.ts';
	import type { Activity } from '#lib/server/activities.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const a = $derived(data.activity);
	let soft = $state(false);
	let picking = $state(false);
	let minimised = $state(false);
	let tab = $state<Setting | 'mates'>('gaff');
	const showPicker = $derived(!a || picking);
	// Players in a running game get game mode: the card takes over the screen until they minimise it.
	const gameMode = $derived(!!a && a.started && a.joined && !minimised && !picking);
	const builtIns = $derived(GAME_IDS.map((id) => GAMES[id]).filter((g) => g.setting === tab));
	const outcomes = { done: 'pulled it off', bailed: 'bailed', caught: 'got caught' };
	const closePicker = () => async ({ update }: { update: () => Promise<void> }) => {
		picking = false;
		minimised = false;
		await update();
	};
</script>

{#snippet card(a: Activity)}
	<div class="space-y-4" aria-live="polite">
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
		{#if a.reveal}
			<p class="border border-zinc-200 px-3 py-2 text-sm" role="status">
				<span class="badge text-hot">Mission revealed</span> {a.reveal.name} {outcomes[a.reveal.outcome]}. The mission was “{a.reveal.mission}”
			</p>
		{/if}
	</div>
{/snippet}

{#snippet moves(a: Activity)}
	<div class="joined [&>form]:flex-1 [&_button]:w-full">
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
				<button class={a.votes.mine ? 'btn-secondary !border-lime !text-lime' : 'btn'} aria-pressed={a.votes.mine}>
					{a.votes.mine ? 'Waiting' : 'Next card'}{a.votes.needed > 1 ? ` ${a.votes.count}/${a.votes.needed}` : ''}
				</button>
			</form>
		{/if}
		{#if a.scored}
			<form method="POST" action="?/next" use:enhance>
				<input type="hidden" name="seen" value={a.position} />
				<button class="btn-secondary {a.votes.mine ? '!border-lime !text-lime' : ''}" aria-pressed={a.votes.mine}>
					{a.votes.mine ? 'Waiting' : 'Skip'}{a.votes.needed > 1 ? ` ${a.votes.count}/${a.votes.needed}` : ''}
				</button>
			</form>
		{/if}
	</div>
	{#if a.votes.needed > 1}
		<p class="text-xs text-zinc-500">
			{a.votes.mine ? 'Tap again to take your vote back. ' : ''}The card moves on when half the players ({a.votes.needed} of {a.players.length}) tap {a.scored ? 'Skip' : 'Next card'}.
		</p>
	{/if}
{/snippet}

{#snippet roster(a: Activity)}
	<ul class="flex flex-wrap border-t border-l border-zinc-200 text-xs font-extrabold tracking-widest uppercase [&>li]:border-r [&>li]:border-b [&>li]:border-zinc-200 [&>li]:px-3 [&>li]:py-2">
		{#each a.players as p (p.id)}
			<li class={a.started && a.player?.id === p.id ? 'bg-lime text-ink' : ''}>{p.name}</li>
		{/each}
	</ul>
{/snippet}

{#if form?.error}<p class="error mb-5" role="alert">{form.error}</p>{/if}

{#if a && gameMode}
	<!-- Game mode: the whole screen is the game, over the app's header and tab bar. -->
	<div class="fixed inset-0 z-40 flex h-dvh flex-col overflow-y-auto bg-ink pb-[env(safe-area-inset-bottom)]" role="dialog" aria-modal="true" aria-label="{a.name}, game mode">
		<div class="grid grid-cols-[1fr_auto_auto] border-b border-zinc-200 text-[11px] font-extrabold tracking-widest uppercase [&_button]:uppercase">
			<p class="min-w-0 truncate px-4 py-3 text-lime">{a.name}{a.soft ? ' · soft' : ''} <span class="text-zinc-500">· {a.number}/{a.total}</span></p>
			<button type="button" class="border-l border-zinc-200 px-4 text-zinc-500 hover:text-zinc-900" onclick={() => (minimised = true)}>Minimise</button>
			<form method="POST" action="?/leave" use:enhance class="flex border-l border-zinc-200">
				<button class="px-4 text-zinc-500 hover:text-zinc-900">Leave</button>
			</form>
		</div>
		<div class="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-6">
			{@render card(a)}
			{@render moves(a)}
		</div>
		<div class="mx-auto w-full max-w-2xl space-y-3 px-4 pb-4">
			{@render roster(a)}
			<div class="flex gap-5 text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase [&_button]:uppercase">
				<button type="button" class="hover:text-zinc-900" onclick={() => (picking = true)}>Change game</button>
				<form method="POST" action="?/end" use:enhance><button class="hover:text-zinc-900">End for everyone</button></form>
			</div>
		</div>
	</div>
{/if}

<div class="space-y-5">
	{#if a && !a.started}
		<!-- The start menu: the game waits here while people join. -->
		<section class="card space-y-4 border-lime">
			<div>
				<p class="badge text-lime">Lobby open</p>
				<h2 class="mt-1 !text-3xl">{a.name}</h2>
				{#if a.soft}<p class="text-sm text-zinc-500">Soft mode</p>{/if}
			</div>
			<p class="text-sm text-zinc-600">{a.rules}</p>
			<div class="space-y-2">
				<p class="label">{a.players.length} in</p>
				{@render roster(a)}
			</div>
			{#if a.joined}
				<div class="joined [&>form]:flex-1 [&_button]:w-full">
					<form method="POST" action="?/begin" use:enhance>
						<button class="btn" disabled={a.players.length < 2}>Start game</button>
					</form>
					<form method="POST" action="?/leave" use:enhance><button class="btn-secondary">Leave</button></form>
				</div>
				<p class="text-xs text-zinc-500">
					{a.players.length < 2 ? 'Waiting for someone else to join. Everyone going has been told.' : 'Anyone who joined can start it. Only players get named on cards.'}
				</p>
				<button type="button" class="text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase hover:text-zinc-900" onclick={() => (picking = !picking)}>
					{picking ? 'Keep this game' : 'Change game'}
				</button>
			{:else}
				<form method="POST" action="?/join" use:enhance><button class="btn w-full">Join game</button></form>
			{/if}
		</section>
	{:else if a}
		<section class="card space-y-4 {a.secret && a.mine ? 'border-hot' : ''}">
			<div class="flex flex-wrap items-center gap-2">
				<h2>{a.name}</h2>
				{#if a.soft}<span class="badge text-lime">Soft mode</span>{/if}
				<span class="ml-auto text-xs text-zinc-500">Card {a.number} of {a.total}</span>
			</div>
			{#if a.joined}
				{@render card(a)}
				{@render moves(a)}
				<div class="flex flex-wrap gap-5 text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase [&_button]:uppercase">
					<button type="button" class="text-lime" onclick={() => ((minimised = false), (picking = false))}>Back to game mode</button>
					<button type="button" class="hover:text-zinc-900" onclick={() => (picking = !picking)}>{picking ? 'Keep playing' : 'Change game'}</button>
				</div>
			{:else}
				<p class="text-sm text-zinc-600">{a.players.length} playing. Join and you’ll be in the next card.</p>
				{@render roster(a)}
				<form method="POST" action="?/join" use:enhance><button class="btn w-full">Join game</button></form>
			{/if}
		</section>
	{/if}

	{#if showPicker && (!a || a.joined)}
		<section class="card space-y-4">
			<div class="flex flex-wrap items-start justify-between gap-2">
				<div>
					<h2>{a ? 'Switch game' : 'Start a game'}</h2>
					<p class="text-sm text-zinc-600">
						{a ? 'Everyone stays in. The new game deals from the top.' : 'Pick one to open a lobby. Everyone going gets told and can join.'}
					</p>
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
						<form method="POST" action="?/open" use:enhance={closePicker}>
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
						<form method="POST" action="?/open" use:enhance={closePicker}>
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
