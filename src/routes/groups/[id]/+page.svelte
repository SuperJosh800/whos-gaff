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
	const maxHosted = $derived(Math.max(1, ...data.leaderboard.map((r) => r.hosted)));
</script>

<svelte:head><title>{data.group.name} · Who's Gaff</title></svelte:head>

<div class="space-y-5">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<h1 class="text-3xl font-extrabold tracking-tight">{data.group.name}</h1>
			<p class="text-zinc-600">{data.members.map((m) => m.name).join(', ')}</p>
		</div>
		<a class="btn" href={newEvent({})}>Plan something with the group</a>
	</div>
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

	<section class="card space-y-3">
		<h2 class="text-lg font-bold">Who’s out? 🍻</h2>
		{#if myAsk}
			<p class="text-sm text-zinc-500">You’ve got an ask out. Delete it to ask about a different night.</p>
		{:else}
			<form method="POST" action="?/ping" use:enhance={() => ({ update }) => update({ reset: false })} class="space-y-2">
				<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="What kind of night">
					{#each plans as [key, plan] (key)}
						<label class="cursor-pointer border border-zinc-300 px-3 py-1.5 text-xs font-extrabold tracking-wider uppercase has-checked:border-lime has-checked:bg-lime has-checked:text-ink has-focus-visible:outline-2 has-focus-visible:outline-hot">
							<input class="sr-only" type="radio" name="plan" value={key} checked={key === 'pub'} />{plan.emoji} {plan.label}
						</label>
					{/each}
				</div>
				<div class="flex flex-wrap gap-2">
					<input class="input w-auto" type="date" name="date" required min={data.today} value={saturday} aria-label="Date" />
					<button class="btn">Ask the group</button>
				</div>
			</form>
		{/if}
		{#each data.pings as p (p.id)}
			{@const mine = p.yes.some((a) => a.user_id === me) ? 'yes' : p.no.some((a) => a.user_id === me) ? 'no' : null}
			{@const plan = PLANS[p.plan]}
			<div class="border border-zinc-200 p-3">
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
					<span class="text-lg font-black uppercase">{p.on_date ? day(p.on_date) : 'This weekend'}</span>
					<span class="badge text-lime">{plan.emoji} {plan.label}</span>
					{#if p.on_date && data.payday && isJustAfterPayday(p.on_date, data.payday)}
						<span class="badge text-lime-800" title="Within a week of your payday">💷 Payday</span>
					{/if}
				</div>
				<p class="mt-1 text-sm text-zinc-600"><strong class="text-zinc-900">{p.name}</strong> asked who’s out{plan.ask}</p>
				<p class="mt-1 text-sm">
					<span class="font-semibold text-emerald-700">{p.yes.length} up for it</span>{#if p.yes.length}: {p.yes.map((a) => a.name).join(', ')}{/if}
					· <span class="text-zinc-500">{p.no.length} not this time</span>
				</p>
				<div class="mt-2 flex flex-wrap gap-2">
					<form method="POST" action="?/answer" use:enhance class="flex gap-2">
						<input type="hidden" name="ping" value={p.id} />
						<button name="answer" value="yes" class="btn-small border text-xs font-extrabold uppercase tracking-wider px-3 py-1 font-semibold {mine === 'yes' ? 'border-lime bg-lime text-ink' : 'border-zinc-300'}">I’m out</button>
						<button name="answer" value="no" class="btn-small border text-xs font-extrabold uppercase tracking-wider px-3 py-1 font-semibold {mine === 'no' ? 'border-hot bg-hot text-ink' : 'border-zinc-300'}">Not this time</button>
					</form>
					{#if p.user_id === me || data.group.created_by === me}
						<form method="POST" action="?/deletePing" use:enhance>
							<input type="hidden" name="ping" value={p.id} />
							<button class="px-1 py-1 text-xs font-bold tracking-wider text-red-700 uppercase underline"
								onclick={(e) => { if (!confirm('Delete this ask for everyone?')) e.preventDefault(); }}>Delete</button>
						</form>
					{/if}
					{#if p.event_id}
						<a class="btn-secondary btn-small ml-auto" href="/events/{p.event_id}">See the event →</a>
					{:else if p.yes.length >= 2}
						<a class="btn btn-small ml-auto" href={newEvent({ ping: String(p.id), title: plan.title, ...(p.on_date ? { date: `${p.on_date}T20:00` } : {}) })}>Make it an event</a>
					{/if}
				</div>
			</div>
		{:else}
			<p class="text-sm text-zinc-500">Pick a night and a date, then ask the group who’s up for it.</p>
		{/each}
	</section>

	<section class="card space-y-3">
		<h2 class="text-lg font-bold">Free gaffs 🏠</h2>
		{#each data.freeGaffs as f (f.id)}
			<div class="flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 px-3 py-2">
				<p><strong>{f.place}</strong> is free {f.from_date === f.to_date ? day(f.from_date) : `${day(f.from_date)} – ${day(f.to_date)}`}
					<span class="text-sm text-zinc-500">· from {f.name}</span></p>
				<a class="btn btn-small ml-auto" href={newEvent({ title: `Gaff at ${f.place}`, date: `${f.from_date}T20:00` })}>Start an event</a>
			</div>
		{:else}
			<p class="text-sm text-zinc-500">No free gaffs right now.</p>
		{/each}
		<form method="POST" action="?/freeGaff" use:enhance class="grid gap-2 border-t border-zinc-100 pt-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
			<input class="input" name="place" placeholder="My place (parents away)" aria-label="Place" />
			<input class="input" name="from" type="date" required aria-label="Free from" />
			<input class="input" name="to" type="date" required aria-label="Free until" />
			<button class="btn-secondary">My place is free</button>
		</form>
	</section>

	<section class="card space-y-3">
		<h2 class="text-lg font-bold">Hosting leaderboard 🏆</h2>
		<ol class="space-y-2">
			{#each data.leaderboard as r, i (r.id)}
				<li class="flex items-center gap-3">
					<span class="w-6 text-right font-bold text-zinc-400">{i + 1}</span>
					<span class="w-28 truncate font-semibold">{r.name}</span>
					<div class="h-3 flex-1 overflow-hidden bg-zinc-100">
						<div class="h-full bg-brand-500" style="width: {(r.hosted / maxHosted) * 100}%"></div>
					</div>
					<span class="w-16 text-sm text-zinc-600">{r.hosted} hosted</span>
					<span class="flex w-44 justify-end">
					{#if r.hosted === 0}
						{#if r.id === me}
							<span class="badge text-amber-800">You owe us a gaff</span>
						{:else}
							<form method="POST" action="?/nudge" use:enhance>
								<input type="hidden" name="user" value={r.id} />
								<button class="badge cursor-pointer text-amber-800 hover:bg-amber-100">
									{form && 'nudged' in form && form.nudged === r.id ? 'Nudged ✓' : 'Owes us a gaff → nudge'}
								</button>
							</form>
						{/if}
					{/if}
					</span>
				</li>
			{/each}
		</ol>
	</section>

	<section class="card space-y-2">
		<h2 class="text-lg font-bold">Invite people to the group</h2>
		<div class="flex gap-2">
			<input class="input bg-zinc-50" readonly value={data.inviteLink} aria-label="Group invite link" />
			<button type="button" class="btn-secondary shrink-0" onclick={async () => { await navigator.clipboard.writeText(data.inviteLink); copied = true; }}>{copied ? 'Copied!' : 'Copy link'}</button>
		</div>
	</section>
</div>
