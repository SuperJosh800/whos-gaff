<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const me = $derived(page.data.user?.id);
	let copied = $state(false);
	const day = (d: string) => new Date(d + 'T00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
	const newEvent = (params: Record<string, string>) =>
		`/events/new?${new URLSearchParams({ group: String(data.group.id), ...params })}`;
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
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 class="text-lg font-bold">Who’s out this weekend? 🍻</h2>
			<form method="POST" action="?/ping" use:enhance><button class="btn btn-small">Ask the group</button></form>
		</div>
		{#each data.pings as p (p.id)}
			{@const mine = p.yes.some((a) => a.user_id === me) ? 'yes' : p.no.some((a) => a.user_id === me) ? 'no' : null}
			<div class="rounded-xl border border-zinc-200 p-3">
				<p class="text-sm"><strong>{p.name}</strong> asked who’s out</p>
				<p class="mt-1 text-sm">
					<span class="font-semibold text-emerald-700">{p.yes.length} up for it</span>{#if p.yes.length}: {p.yes.map((a) => a.name).join(', ')}{/if}
					· <span class="text-zinc-500">{p.no.length} not this time</span>
				</p>
				<div class="mt-2 flex flex-wrap gap-2">
					<form method="POST" action="?/answer" use:enhance class="flex gap-2">
						<input type="hidden" name="ping" value={p.id} />
						<button name="answer" value="yes" class="btn-small rounded-xl border px-3 py-1 font-semibold {mine === 'yes' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-zinc-300'}">I’m out</button>
						<button name="answer" value="no" class="btn-small rounded-xl border px-3 py-1 font-semibold {mine === 'no' ? 'border-zinc-700 bg-zinc-700 text-white' : 'border-zinc-300'}">Not this time</button>
					</form>
					{#if p.event_id}
						<a class="btn-secondary btn-small ml-auto" href="/events/{p.event_id}">See the event →</a>
					{:else if p.yes.length >= 2}
						<a class="btn btn-small ml-auto" href={newEvent({ ping: String(p.id), title: 'Out this weekend' })}>Make it an event</a>
					{/if}
				</div>
			</div>
		{:else}
			<p class="text-sm text-zinc-500">Tap “Ask the group” to see who’s up for something.</p>
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
					<div class="h-3 flex-1 overflow-hidden rounded-full bg-zinc-100">
						<div class="h-full rounded-full bg-brand-500" style="width: {(r.hosted / maxHosted) * 100}%"></div>
					</div>
					<span class="w-16 text-sm text-zinc-600">{r.hosted} hosted</span>
					<span class="flex w-44 justify-end">
					{#if r.hosted === 0}
						{#if r.id === me}
							<span class="badge bg-amber-100 text-amber-800">You owe us a gaff</span>
						{:else}
							<form method="POST" action="?/nudge" use:enhance>
								<input type="hidden" name="user" value={r.id} />
								<button class="badge cursor-pointer bg-amber-100 text-amber-800 hover:bg-amber-200">
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
