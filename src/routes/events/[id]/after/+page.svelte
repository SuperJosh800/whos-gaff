<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { page } from '$app/state';
	import { formatTime, formatWhen } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const going = $derived(data.people);
	const pr = $derived(data.predictions);
	// Whoever called the most awards right; nobody if no award has a winner yet or nobody got one.
	const topScore = $derived(pr.decided ? (pr.table[0]?.score ?? 0) : 0);
	const callers = $derived(pr.table.filter((r) => topScore && r.score === topScore));
	let shared = $state('');
	const lost = $derived(data.lost);
	const me = $derived(page.data.user?.id);
	let lostError = $state('');
	const hg = $derived(data.hangover);
	const worst = $derived(hg.worst.length ? `${hg.worst.map((h) => h.name).join(' & ')} (${hg.scale[hg.worst[0].head]})` : '');
	let headError = $state('');
	const rt = $derived(data.rating);
	const ratingText = $derived(rt.average === null ? '' : `${rt.average.toFixed(1)}/5 from ${rt.count} ${rt.count === 1 ? 'rating' : 'ratings'}`);
	let rateError = $state('');
	const inRate: SubmitFunction = () => async ({ update, result }) => {
		rateError = result.type === 'failure' ? String(result.data?.error ?? 'Something went wrong.') : '';
		if (result.type !== 'failure') await update({ reset: false });
	};
	const inHead: SubmitFunction = () => async ({ update, result }) => {
		headError = result.type === 'failure' ? String(result.data?.error ?? 'Something went wrong.') : '';
		if (result.type !== 'failure') await update({ reset: false });
	};
	// Shows a failed post here in the section rather than at the top of the page.
	const inLost: SubmitFunction = ({ cancel, formData }) => {
		if (formData.get('remove') && !confirm('Take this post down?')) cancel();
		return async ({ update, result }) => {
			lostError = result.type === 'failure' ? String(result.data?.error ?? 'Something went wrong.') : '';
			if (result.type !== 'failure') await update();
		};
	};

	const summary = $derived(
		[
			`${data.event.title}${data.event.starts_at ? ` · ${formatWhen(data.event.starts_at)}` : ''}`,
			`Who came: ${going.map((p) => p.name).join(', ')}`,
			ratingText ? `Rated ${ratingText}` : '',
			...data.awards.filter((a) => a.winners.length).map((a) => `${a.label}: ${a.winners.map((w) => w.name).join(' & ')}`),
			worst ? `Worst hangover: ${worst}` : '',
			callers.length ? `Called it: ${callers.map((c) => c.name).join(' & ')} (${topScore}/${data.awards.length})` : '',
			data.stages.length ? `The night: ${data.stages.map((s) => `${s.name} ${formatTime(s.starts_at)}`).join(' → ')}` : ''
		]
			.filter(Boolean)
			.join('\n')
	);

	// Shares through the phone's share sheet (WhatsApp, Discord…) where available, else copies the recap.
	async function share() {
		const url = `${location.origin}/events/${data.event.id}/after`;
		if (navigator.share) {
			try {
				await navigator.share({ title: `${data.event.title} recap`, text: summary, url });
				return;
			} catch {
				/* cancelled: fall back to copying */
			}
		}
		await navigator.clipboard.writeText(`${summary}\n${url}`);
		shared = 'Copied the recap. Paste it in the group chat!';
	}
</script>

{#if form?.error}<p class="error mb-5" role="alert">{form.error}</p>{/if}

{#if !data.over}
	<p class="card text-zinc-600">Awards and the night recap open once the night starts.</p>
{:else}
	<div class="space-y-5">
		<section class="overflow-hidden border border-zinc-200 p-5 text-zinc-900" aria-label="Night recap card">
			<p class="text-[11px] font-extrabold tracking-widest text-hot uppercase">Night recap</p>
			<h2 class="!text-4xl !leading-none !tracking-tight">{data.event.title}</h2>
			{#if data.event.starts_at}<p class="text-hot">{formatWhen(data.event.starts_at)}</p>{/if}
			{#if ratingText}<p class="mt-1 text-sm text-zinc-600">Rated <strong class="text-zinc-900">{ratingText}</strong></p>{/if}

			{#if data.photos.length}
				<div class="mt-4 grid grid-cols-3 gap-2">
					{#each data.photos.slice(0, 6) as p (p.id)}
						<img src="/events/{data.event.id}/photos/{p.id}" alt="Photo from {p.name}" class="aspect-square w-full object-cover" />
					{/each}
				</div>
			{/if}

			<div class="mt-4 grid border border-zinc-200 sm:grid-cols-3 [&>*]:p-3 [&>*+*]:border-t [&>*+*]:border-zinc-200 sm:[&>*+*]:border-t-0 sm:[&>*+*]:border-l">
				<div>
					<p class="text-xs font-bold text-hot uppercase">Who came</p>
					<p>{going.map((p) => p.name).join(', ')}</p>
				</div>
				<div>
					<p class="text-xs font-bold text-hot uppercase">Awards</p>
					{#each data.awards as a (a.key)}
						<p>{a.label}: <strong>{a.winners.length ? a.winners.map((w) => w.name).join(' & ') : '–'}</strong></p>
					{/each}
					<p>Worst hangover: <strong>{worst || '–'}</strong></p>
					{#if callers.length}<p class="mt-1 text-zinc-600">Called it: <strong class="text-zinc-900">{callers.map((c) => c.name).join(' & ')}</strong> ({topScore}/{data.awards.length})</p>{/if}
				</div>
				{#if data.stages.length}
					<div>
						<p class="text-xs font-bold text-hot uppercase">The night</p>
						{#each data.stages as s (s.id)}<p>{formatTime(s.starts_at)} · {s.name}</p>{/each}
					</div>
				{/if}
			</div>
			<div class="mt-5 flex flex-wrap items-center gap-3">
				<button type="button" class="btn" onclick={share}>Share to the group chat</button>
				{#if shared}<span class="text-sm">{shared}</span>{/if}
			</div>
		</section>

		<section class="card space-y-3" id="rate">
			<h2>Rate the night</h2>
			{#if rateError}<p class="error" role="alert">{rateError}</p>{/if}
			{#if rt.canRate}
				<form method="POST" action="?/rate" use:enhance={inRate} class="strip" role="group" aria-label="Your rating">
					{#each [1, 2, 3, 4, 5] as n (n)}
						<button name="stars" value={n} aria-pressed={rt.mine === n} aria-label="{n} {n === 1 ? 'star' : 'stars'}" class="!text-lg {rt.mine && n <= rt.mine ? 'bg-lime !text-ink' : ''}">★</button>
					{/each}
				</form>
			{/if}
			<p class="text-sm text-zinc-500">
				{ratingText ? `${ratingText}.` : 'Nobody’s rated it yet.'}
				{#if rt.canRate}{rt.mine ? ` You gave it ${rt.mine}. Change it for a week after the night.` : ' Open for a week after the night.'}{:else if rt.closed}{rt.mine ? ` You gave it ${rt.mine}.` : ''} Rating’s closed.{/if}
			</p>
		</section>

		<section class="card space-y-3">
			<h2>Vote for the awards</h2>
			<div class="grid gap-3 sm:grid-cols-3">
				{#each data.awards as a (a.key)}
					<form method="POST" action="?/vote" use:enhance={() => async ({ update }) => update({ reset: false })} class="border border-zinc-200 p-3">
						<input type="hidden" name="award" value={a.key} />
						<label class="label" for="award-{a.key}">{a.label}</label>
						<div class="joined">
							<select class="input" id="award-{a.key}" name="nominee" required value={a.myVote ?? ''}>
								<option value="" disabled>Pick someone</option>
								{#each data.people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
							</select>
							<button class="btn-secondary btn-small">{a.myVote ? 'Change' : 'Vote'}</button>
						</div>
					</form>
				{/each}
			</div>
		</section>

		<section class="card space-y-3" id="hangover">
			<h2>How’s the head?</h2>
			{#if headError}<p class="error" role="alert">{headError}</p>{/if}
			{#if hg.state === 'soon'}
				<p class="text-sm text-zinc-500">The hangover check-in opens {hg.opensAt ? formatWhen(hg.opensAt) : 'once there’s a date'}.</p>
			{:else if hg.state === 'open' && hg.canCheckIn}
				<form method="POST" action="?/head" use:enhance={inHead} class="strip" role="group" aria-label="How’s your head?">
					{#each hg.scale as label, i (label)}
						<button name="head" value={i} aria-pressed={hg.mine === i} class="!px-1">{label}</button>
					{/each}
				</form>
				<p class="text-xs text-zinc-500">The worst head gets Worst hangover, from how people rate themselves, not a vote. Open for 3 days after the night.</p>
			{/if}
			{#if hg.heads.length}
				<ol class="divide-y divide-zinc-200 border border-zinc-200 text-sm">
					{#each hg.heads as h (h.user_id)}
						<li class="grid grid-cols-[1fr_auto]">
							<span class="min-w-0 px-3 py-2.5 font-extrabold break-words">{h.name}{h.user_id === me ? ' (you)' : ''}</span>
							<span class="flex items-center border-l border-zinc-200 px-3 text-[11px] font-extrabold tracking-widest uppercase {hg.worst.some((w) => w.user_id === h.user_id) ? 'bg-lime text-ink' : 'text-zinc-500'}">{hg.scale[h.head]}{#if hg.worst.some((w) => w.user_id === h.user_id)}<span class="sr-only">, worst hangover</span>{/if}</span>
						</li>
					{/each}
				</ol>
			{/if}
			{#if hg.state === 'closed'}<p class="text-sm text-zinc-500">{hg.heads.length ? 'Check-ins have closed.' : 'Nobody checked in.'}</p>{/if}
		</section>

		{#if pr.table.length}
			<section class="card space-y-3" id="predictions">
				<h2>Who called it</h2>
				<p class="text-sm text-zinc-500">{pr.decided ? 'Picks made before the night, marked against the award votes.' : 'Picks made before the night. They’re marked once the award votes come in.'}</p>
				<ol class="divide-y divide-zinc-200 border border-zinc-200 text-sm">
					{#each pr.table as row (row.user_id)}
						<li class="grid grid-cols-[1fr_auto]">
							<div class="min-w-0 px-3 py-2.5">
								<p class="font-extrabold">{row.name}</p>
								<p class="text-zinc-600">
									{#each row.cells as c, i (c.award)}{i ? ' · ' : ''}{data.awards.find((a) => a.key === c.award)?.label}: <span class={c.right ? 'font-bold text-lime' : ''}>{c.nominee ?? '–'}{c.right ? ' ✓' : ''}</span>{/each}
								</p>
							</div>
							{#if pr.decided}
								<span class="flex items-center border-l border-zinc-200 px-3 font-black tabular-nums {row.score && row.score === topScore ? 'bg-lime text-ink' : ''}">{row.score}/{row.cells.length}</span>
							{/if}
						</li>
					{/each}
				</ol>
			</section>
		{/if}

		<section class="card space-y-3" id="lost">
			<h2>Lost property</h2>
			{#if lostError}<p class="error" role="alert">{lostError}</p>{/if}
			{#if lost.items.length}
				<ul class="divide-y divide-zinc-200 border border-zinc-200 text-sm">
					{#each lost.items as i (i.id)}
						<li class="{i.sorted ? 'text-zinc-500' : ''}">
							<div class="grid grid-cols-[5.5rem_1fr] items-start">
								<span class="px-3 py-2.5 text-[11px] font-extrabold tracking-widest uppercase {i.sorted ? 'text-zinc-500' : i.kind === 'lost' ? 'text-hot' : 'text-lime'}">{i.sorted ? 'Sorted' : i.kind}</span>
								<p class="min-w-0 py-2.5 pr-3 break-words"><span class="font-extrabold">{i.text}</span>
									<span class="block text-xs text-zinc-500">{i.kind === 'lost' ? 'Lost' : 'Found'} by {i.name}{i.replies.length ? ` · ${i.replies.join(', ')} ${i.kind === 'lost' ? (i.replies.length > 1 ? 'have got it' : 'has got it') : i.replies.length > 1 ? 'say it’s theirs' : 'says it’s theirs'}` : ''}</span></p>
							</div>
							{#if !i.sorted && lost.canPost && i.user_id !== me}
								<form method="POST" action="?/lostReply" use:enhance={inLost} class="border-t border-zinc-200">
									<input type="hidden" name="item" value={i.id} />
									{#if i.replied}<input type="hidden" name="undo" value="1" />{/if}
									<button class="w-full px-3 py-2 text-left text-[11px] font-extrabold tracking-widest uppercase {i.replied ? 'bg-lime text-ink' : 'text-hot hover:bg-zinc-100'}" aria-pressed={i.replied} aria-label="{i.kind === 'lost' ? 'I’ve got it' : 'That’s mine'}: {i.text}">{i.kind === 'lost' ? 'I’ve got it' : 'That’s mine'}</button>
								</form>
							{/if}
							{#if i.canManage}
								<form method="POST" action="?/lostSort" use:enhance={inLost} class="strip border-x-0 border-b-0">
									<button name="sorted" value={i.sorted ? '0' : '1'} aria-label="{i.sorted ? 'Mark not sorted' : 'Mark sorted'}: {i.text}">{i.sorted ? 'Not sorted' : 'Mark sorted'}</button>
									<button formaction="?/lostRemove" name="remove" value="1" aria-label="Take down: {i.text}">Take down</button>
									<input type="hidden" name="item" value={i.id} />
								</form>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if lost.canPost}
				<form method="POST" action="?/lost" use:enhance={inLost} class="space-y-0">
					<div class="strip" role="radiogroup" aria-label="Lost or found">
						<label class="has-focus-visible:outline-2 has-focus-visible:outline-hot"><input class="sr-only" type="radio" name="kind" value="lost" checked />I lost</label>
						<label class="has-focus-visible:outline-2 has-focus-visible:outline-hot"><input class="sr-only" type="radio" name="kind" value="found" />I found</label>
					</div>
					<div class="joined">
						<input class="input border-t-0" name="text" maxlength="120" required placeholder="Black denim jacket" aria-label="What you lost or found" />
						<button class="btn shrink-0 border-t-0">Post</button>
					</div>
				</form>
				<p class="text-xs text-zinc-500">Everyone who went is told.</p>
			{:else if !lost.items.length}
				<p class="text-sm text-zinc-500">Nothing lost or found.</p>
			{/if}
		</section>

		<section class="card space-y-3">
			<h2>Photos</h2>
			<form method="POST" action="?/photo" enctype="multipart/form-data" use:enhance class="flex flex-wrap items-center gap-2">
				<input class="text-sm" type="file" name="photo" accept="image/jpeg,image/png,image/gif,image/webp" required aria-label="Photo" />
				<button class="btn-secondary">Upload</button>
			</form>
			{#if data.photos.length > 6}<p class="text-sm text-zinc-500">The recap shows the first 6 of {data.photos.length} photos.</p>{/if}
		</section>
	</div>
{/if}
