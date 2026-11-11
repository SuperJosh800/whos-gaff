<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { formatShortDay, formatTime, formatWhen, isJustAfterPayday } from '#lib/time.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const me = $derived(page.data.user?.id);
	const members = $derived(data.attendees.length);
	const best = $derived(Math.max(0, ...data.options.map((o) => o.can)));
	const bestDates = $derived(best ? data.options.filter((o) => o.can === best) : []);
	const deadline = $derived(data.event.vote_deadline);
	// Me first, then everyone else as listed (host first, then by name).
	const people = $derived([
		...data.attendees.filter((a) => a.id === me),
		...data.attendees.filter((a) => a.id !== me)
	]);
	const vote = $derived(new Map(data.votes.map((v) => [`${v.option_id}:${v.user_id}`, v.available])));
	const voted = $derived(new Set(data.votes.map((v) => v.user_id)).size);
	let editing = $state<number | null>(null);

	const cell = (v: 0 | 1 | undefined) =>
		v === 1 ? 'bg-lime text-ink' : v === 0 ? 'bg-hot/25 text-hot' : 'bg-zinc-100 text-zinc-400';
	const mark = (v: 0 | 1 | undefined) => (v === 1 ? '✓' : v === 0 ? '✗' : '–');
	// Clicking your own cell cycles can → can't → no answer.
	const nextVote = (v: 0 | 1 | undefined) => (v === undefined ? '1' : v === 1 ? '0' : '');
</script>

<section class="card space-y-5 p-0">
	<div class="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 p-5">
		<div>
			<h2 class="text-sm font-black text-zinc-900">Who can do what</h2>
			{#if deadline}
				<p class="mt-1 text-sm {data.votingOpen ? 'text-zinc-600' : 'font-bold text-red-700'}">
					{data.votingOpen ? 'Vote by' : 'Voting closed'} {formatWhen(deadline)}
				</p>
			{/if}
		</div>
		<div class="flex gap-6">
			<div class="stat"><b>{voted}/{members}</b><span>Voted</span></div>
			<div class="stat"><b class="!text-lime">{bestDates.length ? bestDates.map((o) => formatShortDay(o.starts_at)).join(', ') : '–'}</b><span>Best date</span></div>
			<div class="stat"><b>{best}/{members}</b><span>Can make it</span></div>
		</div>
	</div>

	{#if !data.votingOpen}
		<p class="mx-5 border px-3 py-2 text-sm {data.isHost ? 'border-amber-500 text-amber-800' : 'border-zinc-300 text-zinc-700'}">
			{data.isHost ? 'Voting has closed. Pick the winning date below to open RSVPs.' : 'Voting has closed. Waiting for the host to pick a date.'}
		</p>
	{/if}

	<div class="overflow-x-auto px-5">
		<table class="w-full min-w-[480px] border-separate border-spacing-1 tabular-nums">
			<thead>
				<tr>
					<th class="w-28"></th>
					{#each data.options as o (o.id)}
						<th class="px-1 pb-2 align-bottom {o.can === best && best ? 'border-t-2 border-hot bg-brand-50' : ''}">
							{#if editing === o.id}
								<form method="POST" action="?/updateOption" class="grid gap-1" use:enhance={() => async ({ update }) => { editing = null; await update(); }}>
									<input type="hidden" name="option" value={o.id} />
									<input class="input px-1 text-xs" type="datetime-local" name="starts_at" value={o.starts_at} required aria-label="New date" />
									<div class="flex justify-center gap-1">
										<button class="btn btn-small">Save</button>
										<button type="button" class="btn-secondary btn-small" onclick={() => (editing = null)}>✕</button>
									</div>
								</form>
							{:else}
								<span class="block pt-2 text-[10px] tracking-widest text-zinc-500 uppercase">{formatShortDay(o.starts_at).split(' ')[0]}</span>
								<span class="block text-2xl leading-none font-black text-zinc-900">{formatShortDay(o.starts_at).split(' ')[1].replace(/\D/g, '')}</span>
								<span class="block text-[11px] text-zinc-500 uppercase">
									{new Date(o.starts_at + 'Z').toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short' })} · {formatTime(o.starts_at)}
								</span>
								{#if o.suggested_by !== data.event.host_id}
									<span class="block text-[10px] font-normal text-zinc-500">by {o.suggested_by_name}</span>
								{/if}
								{#if data.payday && isJustAfterPayday(o.starts_at, data.payday)}
									<span class="badge mt-1 text-lime-800" title="Within a week of your payday">💷 Payday</span>
								{/if}
							{/if}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each people as p (p.id)}
					<tr>
						<td class="truncate pr-2 text-sm {p.id === me ? 'font-black text-lime uppercase' : 'text-zinc-700'}">
							{p.id === me ? `You` : p.name}
						</td>
						{#each data.options as o (o.id)}
							{@const v = vote.get(`${o.id}:${p.id}`)}
							<td>
								{#if p.id === me}
									<form method="POST" action="?/vote" use:enhance>
										<input type="hidden" name="option" value={o.id} />
										<button name="available" value={nextVote(v)} disabled={!data.votingOpen}
											aria-label="Your vote for {formatWhen(o.starts_at)}: {v === 1 ? 'can' : v === 0 ? "can't" : 'no answer'}"
											class="h-9 w-full text-sm font-black outline-1 outline-lime outline-dashed transition hover:brightness-125 disabled:cursor-not-allowed {cell(v)}">
											{mark(v)}
										</button>
									</form>
								{:else}
									<div class="grid h-9 place-items-center text-sm font-black {cell(v)}" title="{p.name}: {v === 1 ? 'can' : v === 0 ? "can't" : 'no answer'}">{mark(v)}</div>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<td class="pt-3 text-xs tracking-widest text-zinc-500 uppercase">Can make it</td>
					{#each data.options as o (o.id)}
						<td class="pt-3 text-center align-top">
							<p class="text-sm" data-testid="count"><b class="text-lg font-black text-lime">{o.can}</b> <span class="text-zinc-500">/ {o.cant} ✗</span></p>
							<div class="mx-1 mt-1 h-1 bg-zinc-100"><div class="h-full bg-lime transition-all" style="width: {members ? (o.can / members) * 100 : 0}%"></div></div>
							{#if data.isHost}
								<form method="POST" action="?/pick" use:enhance class="mt-2">
									<input type="hidden" name="option" value={o.id} />
									<button class="btn-secondary btn-small w-full border-hot text-hot">Lock it</button>
								</form>
								{#if data.votingOpen && editing !== o.id}
									<div class="mt-1 flex justify-center gap-2 text-[11px]">
										<button type="button" class="text-zinc-500 underline hover:text-zinc-900" onclick={() => (editing = o.id)}>Edit</button>
										<form method="POST" action="?/removeOption" use:enhance>
											<input type="hidden" name="option" value={o.id} />
											<button class="text-red-700 underline">Remove</button>
										</form>
									</div>
								{/if}
							{/if}
						</td>
					{/each}
				</tr>
			</tfoot>
		</table>
	</div>
	{#if data.votingOpen}<p class="px-5 text-xs text-zinc-500">Tap your row to cycle can / can't / no answer.</p>{/if}

	{#if data.votingOpen}
		<form method="POST" action={data.isHost ? '?/addOption' : '?/suggest'} use:enhance class="border-t border-zinc-200 p-5">
			<label class="label" for="new-date">{data.isHost ? 'Add a date option' : 'None of these work? Suggest a date'}</label>
			<div class="flex gap-2">
				<input class="input" id="new-date" type="datetime-local" name="starts_at" required />
				<button class="btn-secondary shrink-0">{data.isHost ? 'Add' : 'Suggest'}</button>
			</div>
		</form>
	{:else}
		<div class="pb-1"></div>
	{/if}
</section>
