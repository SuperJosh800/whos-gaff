<script lang="ts">
	import { formatWhen } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const r = $derived(data.review);
	// Whole pounds once it's into three figures, pence below that.
	const pounds = (pence: number) =>
		pence >= 10000 ? `£${Math.round(pence / 100).toLocaleString('en-GB')}` : `£${(pence / 100).toFixed(2)}`;
	const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
	const names = (t: { names: string[] } | null) => (t ? t.names.join(' & ') : null);
	const maxNights = $derived(Math.max(1, ...r.attendance.map((a) => a.count)));
	const crowns = $derived(
		[
			{ label: 'Most nights out', who: names(r.mostOut), detail: r.mostOut && count(r.mostOut.count, 'night') },
			{ label: 'Hosted the most', who: names(r.topHost), detail: r.topHost && count(r.topHost.count, 'night') },
			{ label: 'Bought the most rounds', who: names(r.topRounds), detail: r.topRounds && count(r.topRounds.count, 'round') },
			{ label: 'First home safe', who: names(r.firstHome), detail: r.firstHome && count(r.firstHome.count, 'time') },
			{ label: 'Kept the group moving', who: names(r.mostMoves), detail: r.mostMoves && count(r.mostMoves.count, 'move') },
			...r.awards.map((a) => ({ label: `Voted ${a.label}`, who: names(a.top), detail: a.top && count(a.top.count, 'time') }))
		].filter((c) => c.who)
	);
	let shared = $state('');

	async function share() {
		const text = [
			`${data.group.name}: ${r.year} in review`,
			`${count(r.totals.nights, 'night')} out${r.totals.photos ? `, ${count(r.totals.photos, 'photo')}` : ''}${r.totals.spentPence ? `, ${pounds(r.totals.spentPence)} through the kitty` : ''}`,
			...crowns.map((c) => `${c.label}: ${c.who}`)
		].join('\n');
		// Pin the year so the link keeps showing this one after a new year starts.
		const url = `${location.origin}${location.pathname}?y=${r.year}`;
		if (navigator.share) {
			try {
				await navigator.share({ title: `${data.group.name} ${r.year}`, text, url });
			} catch {
				/* cancelled */
			}
			return;
		}
		try {
			await navigator.clipboard.writeText(`${text}\n${url}`);
			shared = 'Copied. Paste it in the group chat.';
		} catch {
			shared = 'Couldn’t copy. Copy the page link instead.';
		}
	}
</script>

<svelte:head><title>{r.year} in review · {data.group.name} · Who's Gaff</title></svelte:head>

<div class="space-y-6">
	<div class="space-y-3">
		<a class="text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase hover:text-zinc-900" href="/groups/{data.group.id}">Back to {data.group.name}</a>
		<h1 class="text-4xl sm:text-5xl">{r.year} in review</h1>
		{#if data.years.length > 1}
			<nav class="strip" aria-label="Year">
				{#each data.years as y (y)}<a href="?y={y}" aria-current={y === r.year ? 'page' : undefined}>{y}</a>{/each}
			</nav>
		{/if}
	</div>

	{#if !r.totals.nights}
		<p class="card text-zinc-600">No nights out for {data.group.name} in {r.year} yet. Plan one from the group page and it’ll show up here.</p>
	{:else}
		<section class="grid grid-cols-3 border border-zinc-200 text-center [&>*+*]:border-l [&>*+*]:border-zinc-200" aria-label="Totals">
			<div class="px-2 py-4"><p class="text-2xl font-black text-lime tabular-nums sm:text-4xl">{r.totals.nights}</p><p class="label !mb-0">{r.totals.nights === 1 ? 'Night out' : 'Nights out'}</p></div>
			<div class="px-2 py-4"><p class="text-2xl font-black tabular-nums sm:text-4xl">{r.totals.photos}</p><p class="label !mb-0">Photos</p></div>
			<div class="min-w-0 px-2 py-4"><p class="text-2xl font-black break-words tabular-nums sm:text-4xl">{pounds(r.totals.spentPence)}</p><p class="label !mb-0">Kitty</p></div>
		</section>

		{#if crowns.length}
			<section class="card space-y-3">
				<h2>The crowns</h2>
				<ul class="divide-y divide-zinc-200 border border-zinc-200 text-sm">
					{#each crowns as c (c.label)}
						<li class="grid grid-cols-[1fr_auto] items-baseline gap-3 px-3 py-2.5">
							<p class="min-w-0"><span class="block text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase">{c.label}</span><span class="font-extrabold">{c.who}</span></p>
							<span class="text-xs text-zinc-500 tabular-nums">{c.detail}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="card space-y-3">
			<h2>Who came out</h2>
			<table class="w-full table-fixed text-sm">
				<tbody>
					{#each r.attendance as a (a.id)}
						<tr class="border-t border-zinc-200 first:border-t-0">
							<td class="w-28 truncate py-2.5 pr-3 font-extrabold">{a.name}</td>
							<td class="py-2.5"><div class="h-2 bg-zinc-100"><div class="h-full bg-lime" style="width: {(a.count / maxNights) * 100}%"></div></div></td>
							<td class="w-16 py-2.5 text-right font-black tabular-nums">{a.count}/{r.totals.nights}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section class="card space-y-3">
			<h2>The nights</h2>
			{#if r.best}
				<p class="text-sm text-zinc-600">
					Best rated:
					{#if r.best.title}<a class="font-extrabold text-zinc-900 underline underline-offset-4" href="/events/{r.best.id}/after">{r.best.title}</a>{:else}{formatWhen(r.best.starts_at)}{/if}, {r.best.average.toFixed(1)}/5 from {r.best.count} ratings.
				</p>
			{/if}
			{#if r.biggest}
				<p class="text-sm text-zinc-600">
					Biggest:
					{#if r.biggest.title}<a class="font-extrabold text-zinc-900 underline underline-offset-4" href="/events/{r.biggest.id}/after">{r.biggest.title}</a>{:else}{formatWhen(r.biggest.starts_at)}{/if}, {r.biggest.people} people.
				</p>
			{/if}
			<ol class="divide-y divide-zinc-200 border border-zinc-200 text-sm">
				{#each r.nights as n (n.id)}
					<li>
						{#if n.title}
							<a class="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5 hover:bg-zinc-100" href="/events/{n.id}/after"><span class="min-w-0 truncate font-extrabold">{n.title}</span><span class="text-zinc-500">{formatWhen(n.starts_at)}</span></a>
						{:else}
							<p class="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5 text-zinc-500"><span class="min-w-0 truncate">Before you joined</span><span>{formatWhen(n.starts_at)}</span></p>
						{/if}
					</li>
				{/each}
			</ol>
		</section>

		<div class="flex flex-wrap items-center gap-3">
			<button type="button" class="btn" onclick={share}>Share to the group chat</button>
			{#if shared}<span class="text-sm" role="status">{shared}</span>{/if}
		</div>
		<p class="text-xs text-zinc-500">Counts nights planned for {data.group.name} that have happened. Only people still in the group are ranked.</p>
	{/if}
</div>
