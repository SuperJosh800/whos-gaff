<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { formatTime, formatWhen } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const me = $derived(page.data.user?.id);
	const myPlan = $derived(data.homePlans.find((p) => p.user_id === me));
	const noPlan = $derived(data.homePlans.filter((p) => !p.kind));
	const kinds = $derived(Object.entries(data.homeKinds));
	const started = $derived(!!data.event.starts_at && data.now >= data.event.starts_at);
	const overdue = $derived(!!data.cutoff && data.now >= data.cutoff);
	const meCheckedIn = $derived(data.checkIns.find((c) => c.user_id === me)?.at);
	const moveTime = (utc: string) =>
		new Date(utc.replace(' ', 'T') + 'Z').toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
</script>

{#if form?.error}<p class="error mb-5" role="alert">{form.error}</p>{/if}

<div class="space-y-5">
	<section class="card space-y-4">
		<h2 class="text-lg font-bold">The night</h2>
		{#if data.stages.length}
			<ol class="relative space-y-4 border-l-2 border-brand-100 pl-5">
				{#each data.stages as s (s.id)}
					<li class="relative">
						<span class="absolute top-1.5 -left-[27px] h-3 w-3 rounded-full bg-brand-600"></span>
						<p class="font-semibold">{formatTime(s.starts_at)} · {s.name}</p>
						{#if s.place}<p class="text-sm text-zinc-600">{s.place}</p>{/if}
						{#if data.isHost}
							<form method="POST" action="?/removeStage" use:enhance>
								<input type="hidden" name="stage" value={s.id} />
								<button class="text-xs text-red-700 underline">Remove</button>
							</form>
						{/if}
					</li>
				{/each}
			</ol>
		{:else}
			<p class="text-sm text-zinc-500">{data.isHost ? 'Add the stages of the night so nobody gets left behind.' : 'The host hasn’t planned the stages yet.'}</p>
		{/if}
		{#if data.isHost}
			<form method="POST" action="?/addStage" use:enhance class="grid gap-2 border-t border-zinc-100 pt-4 sm:grid-cols-[1fr_1fr_2fr_auto]">
				<input class="input" name="name" placeholder="Pres / Pub / Club" required aria-label="Stage" />
				<input class="input" name="starts_at" type="datetime-local" required aria-label="Time" value={data.event.starts_at ?? ''} />
				<input class="input" name="place" placeholder="Where" aria-label="Where" />
				<button class="btn-secondary">Add stage</button>
			</form>
		{/if}

		<div class="border-t border-zinc-100 pt-4">
			<form method="POST" action="?/move" use:enhance class="flex gap-2">
				<input class="input" name="place" placeholder="We’ve moved to…" required aria-label="We've moved to" />
				<button class="btn shrink-0">📍 Tell everyone</button>
			</form>
			{#if data.moves.length}
				<ul class="mt-3 space-y-1 text-sm">
					{#each data.moves as m (m.id)}
						<li><span class="text-zinc-500">{moveTime(m.created_at)}</span> <span class="font-semibold">{m.name}</span>: we’ve moved to {m.place}</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>

	<section class="card space-y-4">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 class="text-lg font-bold">Getting home</h2>
			{#if data.transitLink}
				<a class="text-sm font-semibold text-brand-700" href={data.transitLink} target="_blank" rel="noopener noreferrer">Check last trains & night buses ↗</a>
			{/if}
		</div>
		{#if myPlan}
			<form method="POST" action="?/homePlan" use:enhance={() => async ({ update }) => update({ reset: false })} class="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
				<select class="input" name="kind" required aria-label="How you're getting home" value={myPlan.kind ?? ''}>
					<option value="" disabled>How are you getting home?</option>
					{#each kinds as [value, label] (value)}<option {value}>{label}</option>{/each}
				</select>
				<input class="input" name="details" placeholder="e.g. 00:12 from Partick, Uber with Sam" aria-label="Details" value={myPlan.details ?? ''} />
				<button class="btn-secondary">Save</button>
			</form>
		{:else}
			<p class="text-sm text-zinc-500">RSVP “going” to add your plan.</p>
		{/if}

		{#if noPlan.length}
			<div class="flex flex-wrap items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
				<span>⚠️ No way home yet: <strong>{noPlan.map((p) => p.name).join(', ')}</strong></span>
				<form method="POST" action="?/nudge" use:enhance class="ml-auto">
					<button class="btn-secondary btn-small">Nudge them</button>
				</form>
				{#if form && 'nudged' in form}<span class="w-full text-xs">Nudged {form.nudged}.</span>{/if}
			</div>
		{/if}
		<ul class="grid gap-2 sm:grid-cols-2">
			{#each data.homePlans.filter((p) => p.kind) as p (p.user_id)}
				<li class="rounded-xl bg-zinc-50 px-3 py-2 text-sm">
					<span class="font-semibold">{p.name}</span> · {data.homeKinds[p.kind!]}
					{#if p.details}<span class="block text-zinc-600">{p.details}</span>{/if}
				</li>
			{/each}
		</ul>
	</section>

	{#if data.event.starts_at}
		<section class="card space-y-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-lg font-bold">Home safe?</h2>
				{#if data.checkIns.some((c) => c.user_id === me)}
					<form method="POST" action="?/homeSafe" use:enhance>
						<button class="btn" disabled={!started || !!meCheckedIn}>
							{meCheckedIn ? '✅ You’re home' : '🏠 I’m home safe'}
						</button>
					</form>
				{/if}
			</div>
			{#if !started}<p class="text-sm text-zinc-500">Check-ins open when the night starts ({formatWhen(data.event.starts_at)}).</p>{/if}
			<ul class="grid gap-2 sm:grid-cols-3">
				{#each data.checkIns as c (c.user_id)}
					<li class="rounded-xl px-3 py-2 text-sm {c.at ? 'bg-emerald-50 text-emerald-800' : overdue ? 'bg-red-100 font-semibold text-red-800' : 'bg-zinc-50 text-zinc-600'}">
						{c.at ? '✅' : overdue ? '⚠️' : '⏳'} {c.name}
						<span class="block text-xs font-normal">{c.at ? `home at ${formatTime(c.at)}` : overdue ? 'not checked in by 3am' : 'not home yet'}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
