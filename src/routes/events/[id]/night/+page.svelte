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
		<h2>The night</h2>
		{#if data.stages.length}
			<ol class="divide-y divide-zinc-200 border border-zinc-200">
				{#each data.stages as s (s.id)}
					<li class="grid grid-cols-[4.5rem_1fr_auto] items-center text-sm">
						<span class="self-stretch border-r border-zinc-200 px-2 py-2.5 font-black text-lime tabular-nums">{formatTime(s.starts_at)}</span>
						<p class="min-w-0 px-3 py-2.5"><span class="font-extrabold uppercase">{s.name}</span>{#if s.place}<span class="block text-zinc-600">{s.place}</span>{/if}</p>
						{#if data.isHost}
							<form method="POST" action="?/removeStage" use:enhance>
								<input type="hidden" name="stage" value={s.id} />
								<button class="h-10 w-10 text-lg text-zinc-500 hover:text-hot" aria-label="Remove {s.name}">×</button>
							</form>
						{/if}
					</li>
				{/each}
			</ol>
		{:else}
			<p class="text-sm text-zinc-500">{data.isHost ? 'Add the stages of the night so nobody gets left behind.' : 'The host hasn’t planned the stages yet.'}</p>
		{/if}
		{#if data.isHost}
			<form method="POST" action="?/addStage" use:enhance class="grid border border-zinc-200 sm:grid-cols-[1fr_15rem_2fr_auto] [&>*]:border-0 [&>*+*]:border-t [&>*+*]:border-zinc-200 sm:[&>*+*]:border-t-0 sm:[&>*+*]:border-l">
				<input class="input" name="name" placeholder="Pres / Pub / Club" required aria-label="Stage" />
				<input class="input" name="starts_at" type="datetime-local" required aria-label="Time" value={data.nextStageAt} />
				<input class="input" name="place" placeholder="Where" aria-label="Where" />
				<button class="btn-secondary">Add stage</button>
			</form>
			{#if !data.event.starts_at && data.nextStageAt}
				<p class="text-xs text-zinc-500">The date isn’t set yet, so this uses the poll’s leading date. When you lock a date, every stage moves to it and keeps its time.</p>
			{/if}
		{/if}

		<div>
			<form method="POST" action="?/move" use:enhance class="joined">
				<input class="input" name="place" placeholder="We’ve moved to…" required aria-label="We've moved to" />
				<button class="btn shrink-0">Tell everyone</button>
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
			<h2>Getting home</h2>
			{#if data.transitLink}
				<a class="text-[11px] font-extrabold tracking-widest text-hot uppercase underline underline-offset-4" href={data.transitLink} target="_blank" rel="noopener noreferrer">Last trains and night buses</a>
			{/if}
		</div>
		{#if myPlan}
			<form method="POST" action="?/homePlan" use:enhance={() => async ({ update }) => update({ reset: false })} class="grid border border-zinc-200 sm:grid-cols-[1fr_2fr_auto] [&>*]:border-0 [&>*+*]:border-t [&>*+*]:border-zinc-200 sm:[&>*+*]:border-t-0 sm:[&>*+*]:border-l">
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
			<div class="grid grid-cols-[1fr_auto] border border-hot text-sm">
				<p class="min-w-0 px-3 py-2.5"><span class="badge text-hot">No way home yet</span> {noPlan.map((p) => p.name).join(', ')}
					{#if form && 'nudged' in form}<span class="block text-xs text-zinc-500">Nudged {form.nudged}.</span>{/if}</p>
				<form method="POST" action="?/nudge" use:enhance class="flex">
					<button class="border-l border-hot px-3 text-[11px] font-extrabold tracking-widest text-hot uppercase hover:bg-zinc-100">Nudge</button>
				</form>
			</div>
		{/if}
		{#if data.homePlans.some((p) => p.kind)}
			<ul class="divide-y divide-zinc-200 border border-zinc-200">
				{#each data.homePlans.filter((p) => p.kind) as p (p.user_id)}
					<li class="grid grid-cols-[6rem_1fr] text-sm">
						<span class="border-r border-zinc-200 px-3 py-2.5 font-extrabold">{p.name}</span>
						<p class="min-w-0 px-3 py-2.5"><span class="text-[11px] font-extrabold tracking-widest uppercase">{data.homeKinds[p.kind!]}</span>
							{#if p.details}<span class="block text-zinc-600">{p.details}</span>{/if}</p>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if data.event.starts_at}
		<section class="card space-y-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2>Home safe?</h2>
				{#if data.checkIns.some((c) => c.user_id === me)}
					<form method="POST" action="?/homeSafe" use:enhance>
						<button class="btn" disabled={!started || !!meCheckedIn}>
							{meCheckedIn ? 'You’re home' : 'I’m home safe'}
						</button>
					</form>
				{/if}
			</div>
			{#if !started}<p class="text-sm text-zinc-500">Check-ins open when the night starts ({formatWhen(data.event.starts_at)}).</p>{/if}
			<ul class="divide-y divide-zinc-200 border border-zinc-200">
				{#each data.checkIns as c (c.user_id)}
					<li class="grid grid-cols-[1fr_auto] items-center text-sm">
						<span class="px-3 py-2.5 font-extrabold">{c.name}</span>
						<span class="px-3 text-[11px] font-extrabold tracking-widest uppercase {c.at ? 'text-lime' : overdue ? 'text-hot' : 'text-zinc-500'}">{c.at ? `Home ${formatTime(c.at)}` : overdue ? 'Not in by 3am' : 'Not home yet'}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
