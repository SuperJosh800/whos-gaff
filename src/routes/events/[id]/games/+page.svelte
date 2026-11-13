<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { page } from '$app/state';
	import { GAMES, GAME_IDS, SETTINGS, SETTING_IDS, type Setting } from '#lib/activities.ts';
	import type { Activity } from '#lib/server/activities.ts';
	import { isRed, type PlayingCard } from '#lib/turnGames.ts';
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
	const me = $derived(page.data.user?.id);
	const b = $derived(data.bets);
	const openBets = $derived(b.bets.filter((x) => !x.outcome));
	const settledBets = $derived(b.bets.filter((x) => x.outcome));
	let betError = $state('');
	// Shows a failed bet here in the section rather than at the top of the page.
	const showBetError: ReturnType<SubmitFunction> = async ({ update, result }) => {
		betError = result.type === 'failure' ? String(result.data?.error ?? 'Something went wrong.') : '';
		if (result.type !== 'failure') await update();
	};
	const inBets: SubmitFunction = () => showBetError;
	// enhance sends the form even when a submit handler prevents it, so the confirm cancels it here.
	const confirmSettle: SubmitFunction = ({ formData, cancel }) => {
		const outcome = String(formData.get('outcome'));
		if (!confirm(outcome === 'off' ? 'Call it off and give everyone their coins back?' : `Settle it as ${outcome.toUpperCase()}? This pays out.`)) cancel();
		return showBetError;
	};
	const closePicker = () => async ({ update }: { update: () => Promise<void> }) => {
		picking = false;
		minimised = false;
		await update();
	};
</script>

{#snippet table(a: Activity, t: NonNullable<Activity['turn']>)}
	{@const red = t.card?.suit === '♥' || t.card?.suit === '♦'}
	<div class="space-y-4" aria-live="polite">
		<p class="text-center text-sm font-extrabold tracking-widest uppercase {t.yours ? 'text-hot' : 'text-zinc-500'}">
			{t.yours ? 'Your turn: tap the deck' : `${t.up?.name ?? 'Someone'}’s turn`}
		</p>
		<div class="grid grid-cols-2 gap-4">
			<form method="POST" action="?/draw" use:enhance class="contents">
				<input type="hidden" name="seen" value={a.position} />
				<button
					class="relative aspect-[5/7] border-2 border-lime bg-[repeating-linear-gradient(45deg,transparent_0_8px,rgb(198_255_61/0.12)_8px_16px)] text-lime shadow-[6px_6px_0_-1px_var(--color-ink),6px_6px_0_0_var(--color-lime),12px_12px_0_-1px_var(--color-ink),12px_12px_0_0_var(--color-lime)] transition enabled:hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-50"
					disabled={!t.yours}
					aria-label={t.yours ? `Draw a card, ${t.left} left` : `Deck, ${t.left} left. ${t.up?.name ?? 'Someone'}’s turn`}>
					<span class="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
						<span class="block text-4xl font-black tabular-nums">{t.left}</span>
						<span class="block text-[11px] font-extrabold tracking-widest uppercase">{t.yours ? 'Tap to draw' : 'left'}</span>
					</span>
				</button>
			</form>
			<div class="relative aspect-[5/7] border-2 {t.card ? 'border-zinc-900 bg-zinc-900' : 'border-dashed border-zinc-300'}">
				{#if t.card}
					<span class="absolute top-2 left-3 text-left text-2xl leading-none font-black {red ? 'text-hot' : 'text-ink'}">{t.card.rank}<br />{t.card.suit}</span>
					<span class="absolute inset-0 flex items-center justify-center text-7xl font-black {red ? 'text-hot' : 'text-ink'}">{t.card.suit}</span>
					<span class="absolute right-3 bottom-2 rotate-180 text-left text-2xl leading-none font-black {red ? 'text-hot' : 'text-ink'}">{t.card.rank}<br />{t.card.suit}</span>
				{:else}
					<span class="absolute inset-0 flex items-center justify-center px-3 text-center text-xs font-extrabold tracking-widest text-zinc-500 uppercase">First card goes here</span>
				{/if}
			</div>
		</div>
		{#if t.card}
			<p class="border border-lime p-4 text-xl leading-snug font-black sm:text-2xl">
				<span class="block text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase">{t.drewIt?.name ?? 'Someone'} drew {t.card.rank}{t.card.suit}</span>
				{t.card.text}
			</p>
		{/if}
		<div class="flex items-center justify-between text-xs font-extrabold tracking-widest uppercase">
			<span class="text-zinc-500">Kings {t.kings}/4</span>
			{#if !t.yours && t.up}
				<form method="POST" action="?/next" use:enhance>
					<input type="hidden" name="seen" value={a.position} />
					<button class="uppercase {a.votes.mine ? 'text-lime' : 'text-zinc-500 hover:text-zinc-900'}" aria-pressed={a.votes.mine}>
						{a.votes.mine ? 'Voted to skip' : `Skip ${t.up.name}`} {a.votes.count}/{a.votes.needed}
					</button>
				</form>
			{/if}
		</div>
		<p class="text-sm text-zinc-600">{a.rules}</p>
	</div>
{/snippet}

{#snippet face(c: PlayingCard | null, small = false)}
	<div class="relative aspect-[5/7] border-2 {c ? 'border-zinc-900 bg-zinc-900' : 'border-dashed border-zinc-300'} {small ? 'w-16' : ''}">
		{#if c}
			<span class="absolute top-1.5 left-2 text-left leading-none font-black {small ? 'text-sm' : 'text-2xl'} {isRed(c) ? 'text-hot' : 'text-ink'}">{c.rank}<br />{c.suit}</span>
			<span class="absolute inset-0 flex items-center justify-center font-black {small ? 'text-3xl' : 'text-7xl'} {isRed(c) ? 'text-hot' : 'text-ink'}">{c.suit}</span>
		{/if}
	</div>
{/snippet}

{#snippet move(a: Activity, fields: Record<string, string | number>, label: string, cls = 'btn')}
	<form method="POST" action="?/move" use:enhance class="flex [&>button]:h-full">
		<input type="hidden" name="seen" value={a.position} />
		{#each Object.entries(fields) as [k, v] (k)}<input type="hidden" name={k} value={v} />{/each}
		<button class="{cls} w-full">{label}</button>
	</form>
{/snippet}

{#snippet play(a: Activity, p: NonNullable<Activity['play']>)}
	<div class="space-y-4" aria-live="polite">
		<p class="text-center text-sm font-extrabold tracking-widest uppercase {p.yours ? 'text-hot' : 'text-zinc-500'}">
			{#if p.kind === 'paranoia' && p.answer}
				{p.yours ? `${p.asker?.name} picked you` : `${p.asker?.name} picked ${p.answer.name}`}
			{:else}
				{p.yours ? 'Your turn' : `${p.up?.name ?? 'Someone'}’s turn`}
			{/if}
		</p>
		{#if p.kind === 'hilo'}
			<div class="mx-auto w-1/2">{@render face(p.table)}</div>
			{#if p.streak}<p class="text-center text-xs font-extrabold tracking-widest text-lime uppercase">{p.streak} right in a row</p>{/if}
			{#if p.yours}
				<div class="joined [&>form]:flex-1">
					{@render move(a, { type: 'guess', guess: 'higher' }, 'Higher')}
					{@render move(a, { type: 'guess', guess: 'lower' }, 'Lower')}
				</div>
				{#if p.streak}{@render move(a, { type: 'pass' }, `Pass it on (${p.streak} right)`, 'btn-secondary')}{/if}
			{/if}
		{:else if p.kind === 'bus'}
			<div class="flex justify-center gap-2">
				{#each [0, 1, 2, 3] as i (i)}{@render face(p.hand[i] ?? null, true)}{/each}
			</div>
			<p class="text-center text-lg font-black">Step {p.step} of 4: {p.prompt}</p>
			{#if p.yours}
				<div class="joined [&>form]:flex-1">
					{#each p.options as o (o)}{@render move(a, { type: 'guess', guess: o }, o)}{/each}
				</div>
			{/if}
		{:else if p.kind === 'paranoia'}
			{#if p.alone}
				<p class="border border-zinc-200 p-4 text-center text-zinc-600">Paranoia needs at least two players. Wait for someone to join.</p>
			{:else if !p.answer}
				{#if p.question}
					<p class="border border-hot p-4 text-2xl leading-snug font-black">
						<span class="block text-[11px] font-extrabold tracking-widest text-hot uppercase">Only you can see this</span>
						{p.question}
					</p>
					<p class="label">Pick who it’s about</p>
					<div class="grid grid-cols-2 border-t border-l border-zinc-200 [&>form]:border-r [&>form]:border-b [&>form]:border-zinc-200">
						{#each a.players.filter((x) => x.id !== p.asker?.id) as x (x.id)}
							{@render move(a, { type: 'answer', who: x.id }, x.name, 'px-3 py-3 text-sm font-extrabold uppercase hover:bg-zinc-100')}
						{/each}
					</div>
				{:else}
					<p class="border border-zinc-200 p-4 text-center text-zinc-600">{p.asker?.name ?? 'Someone'} is reading a secret question…</p>
				{/if}
			{:else if p.yours}
				<p class="border border-lime p-4 text-xl leading-snug font-black">{p.asker?.name} answered a secret question with your name. {a.soft ? 'Do a forfeit' : 'Drink'} to find out what it was?</p>
				<div class="joined [&>form]:flex-1">
					{@render move(a, { type: 'reveal', drink: 1 }, a.soft ? 'Forfeit and see' : 'Drink and see')}
					{@render move(a, { type: 'reveal', drink: 0 }, 'Don’t want to know', 'btn-secondary')}
				</div>
			{:else}
				<p class="border border-zinc-200 p-4 text-center text-zinc-600">Waiting for {p.answer.name} to decide whether to find out.</p>
			{/if}
		{/if}
		{#if p.last}
			<p class="border border-zinc-200 px-3 py-2 text-sm" role="status">
				{#if p.kind === 'paranoia' && 'asker' in p.last}
					{p.last.asker} picked {p.last.answer}.
					{#if p.last.question}<span class="text-lime">The question was “{p.last.question}”</span>{:else}<span class="text-zinc-500">They didn’t find out the question.</span>{/if}
				{:else if 'text' in p.last}
					{p.last.text}{#if p.last.sips}. <span class="font-bold text-hot">{p.last.sips} {p.last.sips === 1 ? 'sip' : 'sips'}</span>{:else if p.last.right}. <span class="text-lime">Right</span>{/if}
				{/if}
			</p>
		{/if}
		{#if !p.yours && p.up}
			<form method="POST" action="?/next" use:enhance class="text-right">
				<input type="hidden" name="seen" value={a.position} />
				<button class="text-xs font-extrabold tracking-widest uppercase {a.votes.mine ? 'text-lime' : 'text-zinc-500 hover:text-zinc-900'}" aria-pressed={a.votes.mine}>
					{a.votes.mine ? 'Voted to skip' : `Skip ${p.up.name}`} {a.votes.count}/{a.votes.needed}
				</button>
			</form>
		{/if}
		<p class="text-sm text-zinc-600">{a.rules}</p>
	</div>
{/snippet}

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
			<li class={a.started && (a.play ? a.play.up?.id === p.id : a.turn ? a.turn.up?.id === p.id : a.player?.id === p.id) ? 'bg-lime text-ink' : ''}>{p.name}</li>
		{/each}
	</ul>
{/snippet}

{#if form?.error}<p class="error mb-5" role="alert">{form.error}</p>{/if}

{#if a && gameMode}
	<!-- Game mode: the whole screen is the game, over the app's header and tab bar. -->
	<div class="fixed inset-0 z-40 flex h-dvh flex-col overflow-y-auto bg-ink pb-[env(safe-area-inset-bottom)]" role="dialog" aria-modal="true" aria-label="{a.name}, game mode">
		<div class="grid grid-cols-[1fr_auto_auto] border-b border-zinc-200 text-[11px] font-extrabold tracking-widest uppercase [&_button]:uppercase">
			<p class="min-w-0 truncate px-4 py-3 text-lime">{a.name}{a.soft ? ' · soft' : ''} {#if !a.turn && !a.play}<span class="text-zinc-500">· {a.number}/{a.total}</span>{/if}</p>
			<button type="button" class="border-l border-zinc-200 px-4 text-zinc-500 hover:text-zinc-900" onclick={() => (minimised = true)}>Minimise</button>
			<form method="POST" action="?/leave" use:enhance class="flex border-l border-zinc-200">
				<button class="px-4 text-zinc-500 hover:text-zinc-900">Leave</button>
			</form>
		</div>
		<div class="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-6">
			{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
			{#if a.play}
				{@render play(a, a.play)}
			{:else if a.turn}
				{@render table(a, a.turn)}
			{:else}
				{@render card(a)}
				{@render moves(a)}
			{/if}
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
				{#if !a.play}<span class="ml-auto text-xs text-zinc-500">Card {a.number} of {a.total}</span>{/if}
			</div>
			{#if a.joined && a.play}
				{@render play(a, a.play)}
				<div class="flex flex-wrap gap-5 text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase [&_button]:uppercase">
					<button type="button" class="text-lime" onclick={() => ((minimised = false), (picking = false))}>Back to game mode</button>
					<button type="button" class="hover:text-zinc-900" onclick={() => (picking = !picking)}>{picking ? 'Keep playing' : 'Change game'}</button>
				</div>
			{:else if a.joined && a.turn}
				{@render table(a, a.turn)}
				<div class="flex flex-wrap gap-5 text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase [&_button]:uppercase">
					<button type="button" class="text-lime" onclick={() => ((minimised = false), (picking = false))}>Back to game mode</button>
					<button type="button" class="hover:text-zinc-900" onclick={() => (picking = !picking)}>{picking ? 'Keep playing' : 'Change game'}</button>
				</div>
			{:else if a.joined}
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

	<section class="card space-y-4" id="bets">
		<div class="flex items-baseline justify-between gap-3">
			<h2>Bets</h2>
			{#if b.wallet !== null}<span class="text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase">You’ve got <span class="text-lime">{b.wallet}</span> coins</span>{/if}
		</div>
		{#if betError}<p class="error" role="alert">{betError}</p>{/if}
		{#each openBets as x (x.id)}
			<div class="border border-zinc-200">
				<div class="flex items-start justify-between gap-3 px-3 py-2.5">
					<p class="min-w-0 break-words"><span class="block text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase">{x.proposer_id === me ? 'Your' : `${x.proposer}’s`} bet</span>
						<span class="text-lg leading-tight font-black">{x.text}</span></p>
					<p class="shrink-0 text-right text-xs text-zinc-500 tabular-nums">Yes <strong class="text-zinc-900">{x.yes}</strong><br />No <strong class="text-zinc-900">{x.no}</strong></p>
				</div>
				{#if b.wallet !== null}
					<form method="POST" action="?/stake" use:enhance={inBets} class="border-t border-zinc-200">
						<input type="hidden" name="bet" value={x.id} />
						<div class="grid grid-cols-[1fr_5rem_auto]">
							<div class="strip border-0" role="radiogroup" aria-label="Your side">
								<label class="has-focus-visible:outline-2 has-focus-visible:outline-hot"><input class="sr-only" type="radio" name="side" value="yes" checked={x.mine?.side !== 'no'} />Yes</label>
								<label class="has-focus-visible:outline-2 has-focus-visible:outline-hot"><input class="sr-only" type="radio" name="side" value="no" checked={x.mine?.side === 'no'} />No</label>
							</div>
							<input class="input border-y-0 text-center" name="coins" type="number" min="1" step="1" required value={x.mine?.coins ?? 10} aria-label="Coins" />
							<button class="btn border-0 px-3">{x.mine ? 'Change' : 'Bet'}</button>
						</div>
					</form>
					{#if x.mine}
						<form method="POST" action="?/stake" use:enhance={inBets} class="flex items-center justify-between gap-3 border-t border-zinc-200 px-3 py-2 text-xs">
							<input type="hidden" name="bet" value={x.id} />
							<input type="hidden" name="side" value={x.mine.side} />
							<input type="hidden" name="coins" value="0" />
							<span>You’ve got <strong class="text-lime">{x.mine.coins}</strong> on <strong class="uppercase">{x.mine.side}</strong></span>
							<button class="font-extrabold tracking-widest text-zinc-500 uppercase hover:text-zinc-900">Take it back</button>
						</form>
					{/if}
				{/if}
				{#if x.canSettle}
					<form method="POST" action="?/settleBet" use:enhance={confirmSettle} class="grid grid-cols-[auto_1fr] items-stretch border-t border-zinc-200">
						<input type="hidden" name="bet" value={x.id} />
						<span class="flex items-center px-3 text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase">Settle</span>
						<div class="strip border-y-0 border-r-0">
							<button name="outcome" value="yes">Yes</button>
							<button name="outcome" value="no">No</button>
							<button name="outcome" value="off">It’s off</button>
						</div>
					</form>
				{:else if x.canCancel}
					<form method="POST" action="?/cancelBet" use:enhance={inBets} class="border-t border-zinc-200 px-3 py-2 text-right">
						<input type="hidden" name="bet" value={x.id} />
						<button class="text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase hover:text-zinc-900" onclick={(e) => { if (!confirm('Call off this bet? Everyone gets their coins back.')) e.preventDefault(); }}>Call it off</button>
					</form>
				{/if}
			</div>
		{/each}
		{#if b.canPropose}
			<form method="POST" action="?/proposeBet" use:enhance={inBets} class="joined">
				<input class="input" name="text" maxlength="100" required placeholder="Sam’s first home" aria-label="The bet" />
				<button class="btn shrink-0">Make a bet</button>
			</form>
			<p class="text-xs text-zinc-500">Pretend coins only: everyone going gets 100 a night. Whoever makes a bet, or the host, settles it once the night’s started. Winners split the losers’ coins.</p>
		{:else if !b.bets.length}
			<p class="text-sm text-zinc-500">RSVP “going” to make bets with pretend coins.</p>
		{/if}
		{#if settledBets.length}
			<ul class="divide-y divide-zinc-200 border border-zinc-200 text-sm">
				{#each settledBets as x (x.id)}
					<li class="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5">
						<p class="min-w-0 break-words">{x.text}
							<span class="block text-xs text-zinc-500">{x.proposer}’s bet · {x.yes} on yes, {x.no} on no</span></p>
						<p class="text-right"><span class="badge {x.outcome === 'off' ? 'text-zinc-500' : 'text-lime'}">{x.outcome === 'off' ? 'Off' : x.outcome}</span>
							{#if x.mine?.result != null}<span class="block text-xs tabular-nums {x.mine.result > 0 ? 'text-lime' : x.mine.result < 0 ? 'text-hot' : 'text-zinc-500'}">{x.mine.result > 0 ? `+${x.mine.result}` : x.mine.result}</span>{/if}</p>
					</li>
				{/each}
			</ul>
		{/if}
		{#if b.coins.length}
			<div class="space-y-2">
				<p class="label !mb-0">Coins tonight</p>
				<ol class="divide-y divide-zinc-200 border border-zinc-200 text-sm">
					{#each b.coins as c, i (c.id)}
						<li class="flex items-center gap-3 px-3 py-2 {i === 0 && c.coins > 100 ? 'bg-lime text-ink' : ''}">
							<span class="font-extrabold">{c.id === me ? 'You' : c.name}</span>
							<span class="ml-auto font-black tabular-nums">{c.coins}</span>
						</li>
					{/each}
				</ol>
			</div>
		{/if}
	</section>

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
