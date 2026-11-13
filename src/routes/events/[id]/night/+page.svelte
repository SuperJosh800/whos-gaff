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
	const m = $derived(data.missions);
	const going = $derived(data.homePlans.some((p) => p.user_id === me));
	const suspects = $derived(data.homePlans.filter((p) => p.user_id !== me));
	const pr = $derived(data.predictions);
	let preview = $state<string | null>(null);
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

	<section class="card space-y-3" id="predictions">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2>Predictions</h2>
			{#if pr.count}<span class="text-xs text-zinc-500">{pr.count} {pr.count === 1 ? 'person has' : 'people have'} predicted</span>{/if}
		</div>
		{#if pr.locked}
			<p class="text-sm text-zinc-600">
				Predictions locked when the night started.
				{#if pr.count}<a class="font-semibold text-hot underline underline-offset-4" href="/events/{data.event.id}/after#predictions">See who called it</a>{/if}
			</p>
		{:else if !pr.open}
			<p class="text-sm text-zinc-500">Predictions open once the date is set.</p>
		{:else if !pr.canPredict}
			<p class="text-sm text-zinc-500">RSVP “going” to make predictions.</p>
		{:else}
			<form method="POST" action="?/predict" use:enhance={() => async ({ update }) => update({ reset: false })} class="space-y-3">
				<div class="divide-y divide-zinc-200 border border-zinc-200">
					{#each Object.entries(data.awards) as [key, label] (key)}
						<label class="grid grid-cols-[11rem_1fr] items-stretch">
							<span class="flex items-center border-r border-zinc-200 px-3 text-[11px] font-extrabold tracking-widest uppercase">{label}</span>
							<select class="input border-0" name={key} value={pr.mine[key as keyof typeof pr.mine] ?? ''}>
								<option value="">Pick someone</option>
								{#each pr.people as p (p.id)}<option value={p.id}>{p.id === me ? `${p.name} (you)` : p.name}</option>{/each}
							</select>
						</label>
					{/each}
				</div>
				<button class="btn w-full">{Object.keys(pr.mine).length ? 'Update predictions' : 'Save predictions'}</button>
				{#if form && 'predicted' in form}<p class="text-sm text-lime" role="status">Saved. Nobody sees your picks until the night starts.</p>{/if}
			</form>
			<p class="text-xs text-zinc-500">
				Who’ll win each award? Picks stay hidden until the night starts ({formatWhen(data.event.starts_at!)}), then the award votes afterwards decide who called it.
			</p>
		{/if}
	</section>

	<section class="card space-y-4" id="missions">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2>Secret missions</h2>
			{#if m.live}<span class="text-xs text-zinc-500">{m.live} {m.live === 1 ? 'person is' : 'people are'} on a mission right now</span>{/if}
		</div>
		{#if !going}
			<p class="text-sm text-zinc-500">RSVP “going” to get a mission.</p>
		{:else if m.mine}
			<div class="border border-hot">
				<p class="px-3 pt-3 text-[11px] font-extrabold tracking-widest text-hot uppercase">Your mission · only you can see this · {m.mine.points} pts</p>
				<p class="px-3 pt-1 pb-3 text-xl leading-snug font-black">{m.mine.text}</p>
				<form method="POST" action="?/missionDone" enctype="multipart/form-data"
					use:enhance={() => async ({ update }) => { await update(); preview = null; }}
					class="border-t border-hot">
					{#if m.mine.photo}
						<label class="flex cursor-pointer items-center gap-3 border-b border-zinc-200 px-3 py-2.5 text-sm has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-hot">
							<input class="sr-only" type="file" name="photo" accept="image/*" capture="environment" required
								onchange={(e) => { const f = e.currentTarget.files?.[0]; preview = f ? URL.createObjectURL(f) : null; }} />
							{#if preview}<img src={preview} alt="Your proof" class="h-12 w-12 object-cover" />{/if}
							<span class="text-[11px] font-extrabold tracking-widest uppercase {preview ? 'text-lime' : 'text-zinc-700'}">{preview ? 'Photo ready · tap to change' : 'Take the proof photo'}</span>
						</label>
					{/if}
					<div class="joined [&>*]:flex-1">
						<button class="btn">Done it</button>
						<button class="btn-secondary" formaction="?/swapMission" formnovalidate disabled={!m.swapsLeft}>Swap ({m.swapsLeft} left)</button>
					</div>
				</form>
			</div>
			<p class="text-xs text-zinc-500">Pull it off any time tonight without anyone clocking it. Act normal: everyone else might have one too.</p>
		{:else}
			<form method="POST" action="?/takeMission" use:enhance>
				<button class="btn w-full">Get a secret mission</button>
			</form>
			<p class="text-xs text-zinc-500">One mission, just for you, to pull off any time tonight. Some need a photo as proof.</p>
		{/if}

		{#if going && suspects.length}
			<form method="POST" action="?/callOut" use:enhance class="space-y-2 border-t border-zinc-200 pt-4">
				<p class="label">Think someone’s on a mission?</p>
				<div class="joined">
					<select class="input min-w-0 flex-1" name="suspect" required aria-label="Who">
						<option value="" disabled selected>Call someone out</option>
						{#each suspects as p (p.user_id)}<option value={p.user_id}>{p.name}</option>{/each}
					</select>
					<button class="btn-secondary">Call out</button>
				</div>
				{#if form && 'callOut' in form && form.callOut}
					<p class="text-sm {form.callOut.caught ? 'text-lime' : 'text-zinc-500'}" role="status">
						{form.callOut.caught ? 'Caught them! That’s a point to you.' : 'Nope, not on a mission. Everyone can see you guessed.'}
					</p>
				{/if}
				<p class="text-xs text-zinc-500">Right and their mission is caught, with a point to you. Wrong guesses show up for everyone.</p>
			</form>
		{/if}

		{#if m.settled.length}
			<ul class="divide-y divide-zinc-200 border border-zinc-200 text-sm">
				{#each m.settled as s (s.id)}
					<li class="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5">
						<p class="min-w-0">
							<span class="font-extrabold">{s.user_id === me ? 'You' : s.name}</span>
							{s.status === 'done' ? `pulled it off (+${s.points})` : `got caught by ${s.caught_by ?? 'someone'}`}
							<span class="block text-zinc-600">“{s.text}”</span>
						</p>
						{#if s.photo_id}
							<a href="/events/{data.event.id}/photos/{s.photo_id}" target="_blank" rel="noopener noreferrer">
								<img src="/events/{data.event.id}/photos/{s.photo_id}" alt="Proof for {s.name}'s mission" class="h-14 w-14 border border-zinc-200 object-cover" />
							</a>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if m.misses.length}
			<p class="text-xs text-zinc-500">Wrong calls: {m.misses.map((x) => `${x.name} on ${x.suspect}`).join(', ')}</p>
		{/if}
		{#if m.scores.length}
			<ol class="flex flex-wrap border-t border-l border-zinc-200 text-xs font-extrabold tracking-widest uppercase [&>li]:border-r [&>li]:border-b [&>li]:border-zinc-200 [&>li]:px-3 [&>li]:py-2">
				{#each m.scores as sc, i (sc.id)}<li class={i === 0 ? 'bg-lime text-ink' : ''}>{sc.name} {sc.points}</li>{/each}
			</ol>
		{/if}
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
