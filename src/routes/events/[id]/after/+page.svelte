<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatTime, formatWhen } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const going = $derived(data.people);
	const pr = $derived(data.predictions);
	// Whoever called the most awards right; nobody if no award has a winner yet or nobody got one.
	const topScore = $derived(pr.decided ? (pr.table[0]?.score ?? 0) : 0);
	const callers = $derived(pr.table.filter((r) => topScore && r.score === topScore));
	let shared = $state('');

	const summary = $derived(
		[
			`${data.event.title}${data.event.starts_at ? ` · ${formatWhen(data.event.starts_at)}` : ''}`,
			`Who came: ${going.map((p) => p.name).join(', ')}`,
			...data.awards.filter((a) => a.winners.length).map((a) => `${a.label}: ${a.winners.map((w) => w.name).join(' & ')}`),
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
