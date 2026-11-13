<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { PLANS, type Plan } from '#lib/plans.ts';
	import { isJustAfterPayday } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const me = $derived(page.data.user?.id);
	let copied = $state(false);
	const day = (d: string) => new Date(d + 'T00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
	const newEvent = (params: Record<string, string>) =>
		`/events/new?${new URLSearchParams({ group: String(data.group.id), ...params })}`;
	const plans = Object.entries(PLANS) as [Plan, (typeof PLANS)[Plan]][];
	// Default the ask to the coming Saturday (today if it is Saturday).
	const saturday = $derived.by(() => {
		const d = new Date(data.today + 'T00:00Z');
		d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
		return d.toISOString().slice(0, 10);
	});
	const myAsk = $derived(data.pings.some((p) => p.user_id === me));
	const dayPart = (d: string, part: 'num' | 'mon' | 'dow') => {
		const date = new Date(d + 'T00:00Z');
		if (part === 'num') return date.getUTCDate();
		return date.toLocaleDateString('en-GB', { timeZone: 'UTC', ...(part === 'mon' ? { month: 'short' } : { weekday: 'short' }) });
	};
	const maxHosted = $derived(Math.max(1, ...data.leaderboard.map((r) => r.hosted)));
</script>

<svelte:head><title>{data.group.name} · Who's Gaff</title></svelte:head>

<div class="space-y-6">
	<div class="space-y-3">
		<h1 class="text-4xl sm:text-5xl">{data.group.name}</h1>
		<div class="grid grid-cols-[1fr_auto] border border-zinc-200 text-sm">
			<p class="min-w-0 px-3 py-2.5 text-zinc-700">{data.members.map((m) => m.name).join(', ')}</p>
			<a class="border-l border-zinc-200 px-3 py-2.5 text-[11px] font-extrabold tracking-widest text-hot uppercase hover:bg-zinc-100" href={newEvent({})}>Plan something</a>
		</div>
	</div>
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

	<section class="space-y-3">
		<h2>Who’s out</h2>
		{#if myAsk}
			<p class="text-sm text-zinc-500">You’ve got an ask out. Delete it to ask about a different night.</p>
		{:else}
			<form method="POST" action="?/ping" use:enhance={() => ({ update }) => update({ reset: false })}>
				<div class="strip" role="radiogroup" aria-label="What kind of night">
					{#each plans as [key, plan] (key)}
						<label class="has-focus-visible:outline-2 has-focus-visible:outline-hot">
							<input class="sr-only" type="radio" name="plan" value={key} checked={key === 'pub'} />{key === 'anything' ? 'Any' : plan.label}
						</label>
					{/each}
				</div>
				<div class="joined">
					<input class="input border-t-0" type="date" name="date" required min={data.today} value={saturday} aria-label="Date" />
					<button class="btn shrink-0 border-t-0">Ask</button>
				</div>
			</form>
		{/if}
		{#if data.pings.length}
			<table class="w-full text-sm">
				<thead>
					<tr class="text-left text-[11px] tracking-widest text-zinc-500 uppercase">
						<th class="pb-1.5 font-extrabold">Night</th>
						<th class="pb-1.5 font-extrabold">Plan</th>
						<th class="pb-1.5 font-extrabold">In</th>
						<th class="pb-1.5 text-center font-extrabold">You</th>
						<th><span class="sr-only">Delete</span></th>
					</tr>
				</thead>
				<tbody>
					{#each data.pings as p (p.id)}
						{@const mine = p.yes.some((a) => a.user_id === me) ? 'yes' : p.no.some((a) => a.user_id === me) ? 'no' : null}
						{@const plan = PLANS[p.plan]}
						{@const payday = !!(p.on_date && data.payday && isJustAfterPayday(p.on_date, data.payday))}
						<tr class="border-t border-zinc-200 align-top">
							<td class="w-20 py-3 pr-2">
								{#if p.on_date}
									<span class="block text-lg leading-none font-black whitespace-nowrap">{dayPart(p.on_date, 'num')} <span class="text-xs">{dayPart(p.on_date, 'mon')}</span></span>
									<span class="text-[10px] font-extrabold tracking-widest uppercase {payday ? 'text-lime-800' : 'text-zinc-500'}">{dayPart(p.on_date, 'dow')}{payday ? ' · payday' : ''}</span>
								{:else}
									<span class="text-xs font-black uppercase">This<br />weekend</span>
								{/if}
							</td>
							<td class="py-3 pr-2"><span class="text-[11px] font-extrabold tracking-widest uppercase">{plan.label}</span>
								<span class="block text-xs text-zinc-500">{p.user_id === me ? 'You asked' : `${p.name} asked`}</span></td>
							<td class="min-w-0 py-3 pr-2">
								<b class="text-lg leading-none font-black text-lime">{p.yes.length}</b>
								<span class="block text-xs text-zinc-500">{[p.yes.map((a) => a.name).join(', '), p.no.length ? `${p.no.length} can’t` : ''].filter(Boolean).join('; ')}</span>
								{#if p.event_id}
									<a class="mt-1 inline-block text-[11px] font-extrabold tracking-widest text-lime uppercase underline underline-offset-4" href="/events/{p.event_id}">See the event</a>
								{:else if p.yes.length >= 2}
									<a class="mt-1 inline-block text-[11px] font-extrabold tracking-widest text-hot uppercase underline underline-offset-4"
										href={newEvent({ ping: String(p.id), title: plan.title, ...(p.on_date ? { date: `${p.on_date}T20:00` } : {}) })}>Make it an event</a>
								{/if}
							</td>
							<td class="w-12 py-2 text-center">
								<form method="POST" action="?/answer" use:enhance>
									<input type="hidden" name="ping" value={p.id} />
									<button name="answer" value={mine === null ? 'yes' : mine === 'yes' ? 'no' : ''}
										aria-label="Your answer: {mine === 'yes' ? 'in' : mine === 'no' ? 'can’t' : 'no answer'}. Tap to change."
										class="h-9 w-10 text-sm font-black {mine === 'yes' ? 'bg-lime text-ink' : mine === 'no' ? 'bg-red-50 text-hot' : 'bg-zinc-100 text-zinc-400 outline-1 -outline-offset-1 outline-lime outline-dashed'} focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-hot">
										{mine === 'yes' ? '✓' : mine === 'no' ? '✗' : '–'}
									</button>
								</form>
							</td>
							<td class="w-8 py-2 text-right">
								{#if p.user_id === me || data.group.created_by === me}
									<form method="POST" action="?/deletePing" use:enhance>
										<input type="hidden" name="ping" value={p.id} />
										<button class="h-9 w-8 text-lg text-zinc-500 hover:text-hot" aria-label="Delete this ask"
											onclick={(e) => { if (!confirm('Delete this ask for everyone?')) e.preventDefault(); }}>×</button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="text-xs text-zinc-500">Tap your square: in, can’t, no answer.</p>
		{:else}
			<p class="text-sm text-zinc-500">Pick a night and a date, then ask the group who’s up for it.</p>
		{/if}
	</section>

	<section class="card space-y-3">
		<h2>Free gaffs</h2>
		{#if data.freeGaffs.length}
			<ul class="divide-y divide-zinc-200 border border-zinc-200">
				{#each data.freeGaffs as f (f.id)}
					<li class="grid grid-cols-[1fr_auto] text-sm">
						<p class="min-w-0 px-3 py-2.5"><span class="font-extrabold">{f.place}</span> is free {f.from_date === f.to_date ? day(f.from_date) : `${day(f.from_date)} – ${day(f.to_date)}`}
							<span class="text-zinc-500">· from {f.name}</span></p>
						<a class="flex items-center border-l border-zinc-200 px-3 text-[11px] font-extrabold tracking-widest text-hot uppercase hover:bg-zinc-100" href={newEvent({ title: `Gaff at ${f.place}`, date: `${f.from_date}T20:00` })}>Start an event</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-zinc-500">No free gaffs right now.</p>
		{/if}
		<form method="POST" action="?/freeGaff" use:enhance class="grid border border-zinc-200 sm:grid-cols-[2fr_1fr_1fr_auto] [&>*]:border-0 [&>*+*]:border-t [&>*+*]:border-zinc-200 sm:[&>*+*]:border-t-0 sm:[&>*+*]:border-l">
			<input class="input" name="place" placeholder="My place (parents away)" aria-label="Place" />
			<input class="input" name="from" type="date" required aria-label="Free from" />
			<input class="input" name="to" type="date" required aria-label="Free until" />
			<button class="btn-secondary">My place is free</button>
		</form>
	</section>

	<section class="card space-y-3" id="season">
		<div class="flex items-baseline justify-between gap-3">
			<h2>Season {data.season}</h2>
			<span class="text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase">Games + missions</span>
		</div>
		{#if data.seasons.length > 1}
			<nav class="strip" aria-label="Season">
				{#each data.seasons as y (y)}
					<a href="?season={y}#season" aria-current={y === data.season ? 'page' : undefined} data-sveltekit-noscroll>{y}</a>
				{/each}
			</nav>
		{/if}
		{#if data.seasonBoard.some((r) => r.points)}
			<table class="w-full text-sm">
				<thead>
					<tr class="text-left text-[11px] tracking-widest text-zinc-500 uppercase">
						<th class="w-8 pb-1.5 font-extrabold"><span class="sr-only">Place</span></th>
						<th class="pb-1.5 font-extrabold">Who</th>
						<th class="pb-1.5 pl-2 text-right font-extrabold">Games</th>
						<th class="pb-1.5 pl-2 text-right font-extrabold">Missions</th>
						<th class="pb-1.5 pl-2 text-right font-extrabold">Points</th>
					</tr>
				</thead>
				<tbody>
					{#each data.seasonBoard as r (r.id)}
						{@const top = r.place === 1 && r.points > 0}
						<tr class="border-t border-zinc-200 {top ? 'bg-lime text-ink' : ''}">
							<td class="px-1 py-2.5 font-black tabular-nums {top ? '' : 'text-zinc-500'}">{r.place}</td>
							<td class="py-2.5 pr-2 break-all"><span class="font-extrabold {r.id === me && !top ? 'text-lime' : ''}">{r.id === me ? 'You' : r.name}</span>
								<span class="block text-xs {top ? '' : 'text-zinc-500'}">{r.nights} {r.nights === 1 ? 'night' : 'nights'}</span></td>
							<td class="py-2.5 pl-2 text-right tabular-nums">{r.games}</td>
							<td class="py-2.5 pl-2 text-right tabular-nums">{r.missions}</td>
							<td class="py-2.5 pr-1 pl-2 text-right text-lg font-black tabular-nums">{r.points}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="text-xs text-zinc-500">Points from scored games and secret missions at the group’s nights in {data.season}. Night-tab missions score their points when you do them, and 1 when you catch someone.</p>
		{:else}
			<p class="text-sm text-zinc-500">No points yet in {data.season}. Play a scored game or take a Night-tab mission at one of the group’s nights and the table starts here.</p>
		{/if}
	</section>

	<section class="card space-y-3">
		<h2>Hosting leaderboard</h2>
		<table class="w-full text-sm">
			<tbody>
				{#each data.leaderboard as r, i (r.id)}
					<tr class="border-t border-zinc-200 first:border-t-0">
						<td class="w-8 py-2.5 font-black text-zinc-500 tabular-nums">{i + 1}</td>
						<td class="w-28 truncate py-2.5 pr-3 font-extrabold">{r.name}</td>
						<td class="py-2.5">
							<div class="h-2 bg-zinc-100"><div class="h-full bg-lime" style="width: {(r.hosted / maxHosted) * 100}%"></div></div>
						</td>
						<td class="w-10 py-2.5 text-right font-black tabular-nums">{r.hosted}</td>
						<td class="w-24 py-2.5 text-right">
							{#if r.hosted === 0}
								{#if r.id === me}
									<span class="badge text-amber-800">You owe one</span>
								{:else}
									<form method="POST" action="?/nudge" use:enhance>
										<input type="hidden" name="user" value={r.id} />
										<button class="badge cursor-pointer text-amber-800 underline underline-offset-4">
											{form && 'nudged' in form && form.nudged === r.id ? 'Nudged' : 'Nudge'}
										</button>
									</form>
								{/if}
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="text-xs text-zinc-500">Dated events hosted for the group. Nudge anyone who hasn’t had everyone round yet.</p>
	</section>

	<a class="grid grid-cols-[1fr_auto] items-center border border-zinc-200 hover:bg-zinc-100" href="/groups/{data.group.id}/quiz">
		<span class="px-3 py-3"><span class="block text-[11px] font-extrabold tracking-widest text-hot uppercase">Group quiz</span><span class="text-sm text-zinc-600">Write questions about each other and see who knows the group best.</span></span>
		{#if data.quizLeft}<span class="self-stretch border-l border-zinc-200 bg-lime px-3 py-3 text-center text-ink"><span class="block text-xl leading-none font-black tabular-nums">{data.quizLeft}</span><span class="text-[10px] font-extrabold tracking-widest uppercase">to answer</span></span>{/if}
	</a>

	<a class="block border border-lime px-3 py-3 hover:bg-zinc-100" href="/groups/{data.group.id}/year">
		<span><span class="block text-[11px] font-extrabold tracking-widest text-lime uppercase">Year in review</span><span class="text-sm text-zinc-600">Nights out, crowns and who came out the most.</span></span>
	</a>

	<section class="card space-y-2">
		<h2>Invite people to the group</h2>
		<div class="joined">
			<input class="input bg-zinc-50" readonly value={data.inviteLink} aria-label="Group invite link" />
			<button type="button" class="btn-secondary shrink-0" onclick={async () => { await navigator.clipboard.writeText(data.inviteLink); copied = true; }}>{copied ? 'Copied!' : 'Copy link'}</button>
		</div>
	</section>
</div>
