<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatWhen, isJustAfterPayday } from '#lib/time.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const members = $derived(data.attendees.length);
	const best = $derived(Math.max(0, ...data.options.map((o) => o.can)));
	const deadline = $derived(data.event.vote_deadline);
	let editing = $state<number | null>(null);
</script>

<section class="card space-y-4">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="text-lg font-bold">Which dates can you do?</h2>
		{#if deadline}
			<p class="text-sm {data.votingOpen ? 'text-zinc-600' : 'font-semibold text-red-700'}">
				{data.votingOpen ? 'Vote by' : 'Voting closed'}
				{formatWhen(deadline)}
			</p>
		{/if}
	</div>

	{#if !data.votingOpen && data.isHost}
		<p class="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
			Voting has closed. Pick the winning date below to open RSVPs.
		</p>
	{:else if !data.votingOpen}
		<p class="rounded-xl bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
			Voting has closed. Waiting for the host to pick a date.
		</p>
	{/if}

	<ul class="space-y-3">
		{#each data.options as option (option.id)}
			<li
				class="rounded-xl border p-3 {option.can === best && best > 0
					? 'border-emerald-300 bg-emerald-50/50'
					: 'border-zinc-200'}"
			>
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						{#if editing === option.id}
							<form method="POST" action="?/updateOption" class="flex gap-2" use:enhance={() => async ({ update }) => { editing = null; await update(); }}>
								<input type="hidden" name="option" value={option.id} />
								<input class="input" type="datetime-local" name="starts_at" value={option.starts_at} required aria-label="New date" />
								<button class="btn btn-small">Save</button>
								<button type="button" class="btn-secondary btn-small" onclick={() => (editing = null)}>Cancel</button>
							</form>
						{:else}
							<p class="font-semibold">
								{formatWhen(option.starts_at)}
								{#if data.payday && isJustAfterPayday(option.starts_at, data.payday)}
									<span class="badge ml-1 bg-lime-100 text-lime-800" title="Within a week of your payday">💷 Just after payday</span>
								{/if}
							</p>
						{/if}
						<p class="text-sm text-zinc-600" data-testid="count">
							<span class="font-semibold text-emerald-700">{option.can} can</span>,
							<span class="font-semibold text-red-700">{option.cant} can't</span>
							{#if option.suggested_by !== data.event.host_id}
								· suggested by {option.suggested_by_name}
							{/if}
						</p>
					</div>

					<div class="flex flex-wrap items-center gap-2">
						<form method="POST" action="?/vote" use:enhance class="flex overflow-hidden rounded-xl border border-zinc-300">
							<input type="hidden" name="option" value={option.id} />
							<button name="available" value="1" disabled={!data.votingOpen} aria-pressed={option.mine === 1}
								class="px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed {option.mine === 1 ? 'bg-emerald-600 text-white' : 'bg-white text-zinc-700 hover:bg-emerald-50'}">
								Can do
							</button>
							<button name="available" value="0" disabled={!data.votingOpen} aria-pressed={option.mine === 0}
								class="border-l border-zinc-300 px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed {option.mine === 0 ? 'bg-red-600 text-white' : 'bg-white text-zinc-700 hover:bg-red-50'}">
								Can't
							</button>
						</form>
						{#if data.isHost}
							<form method="POST" action="?/pick" use:enhance>
								<input type="hidden" name="option" value={option.id} />
								<button class="btn btn-small">Pick this date</button>
							</form>
						{/if}
					</div>
				</div>

				<div class="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
					<div class="h-full rounded-full bg-emerald-500 transition-all" style="width: {members ? (option.can / members) * 100 : 0}%"></div>
				</div>
				{#if option.can_names}<p class="mt-1 text-xs text-zinc-500">Can do: {option.can_names}</p>{/if}

				{#if data.isHost && data.votingOpen && editing !== option.id}
					<div class="mt-2 flex gap-3 text-xs">
						<button type="button" class="text-zinc-600 underline hover:text-zinc-900" onclick={() => (editing = option.id)}>Edit</button>
						<form method="POST" action="?/removeOption" use:enhance>
							<input type="hidden" name="option" value={option.id} />
							<button class="text-red-700 underline hover:text-red-900">Remove</button>
						</form>
					</div>
				{/if}
			</li>
		{/each}
	</ul>

	{#if data.votingOpen}
		<form method="POST" action={data.isHost ? '?/addOption' : '?/suggest'} use:enhance class="border-t border-zinc-100 pt-4">
			<label class="label" for="new-date">{data.isHost ? 'Add a date option' : 'None of these work? Suggest a date'}</label>
			<div class="flex gap-2">
				<input class="input" id="new-date" type="datetime-local" name="starts_at" required />
				<button class="btn-secondary shrink-0">{data.isHost ? 'Add' : 'Suggest'}</button>
			</div>
		</form>
	{/if}
</section>
