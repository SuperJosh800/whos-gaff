<script lang="ts">
	import { isJustAfterPayday, isLocalDateTime } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	const initial = form?.values;
	let mode = $state<'fixed' | 'poll'>(initial?.mode ?? 'fixed');
	let options = $state<string[]>(initial?.options?.length ? initial.options : ['', '']);
	let hasDeadline = $state(!!initial?.voteDeadline);
</script>

<h1 class="mb-4 text-2xl font-bold">New event</h1>

<form method="POST" class="card max-w-xl space-y-5">
	{#if form?.error}<p class="error">{form.error}</p>{/if}

	<div>
		<label class="label" for="title">Title</label>
		<input class="input" id="title" name="title" required maxlength="120" placeholder="Pres at mine" value={initial?.title ?? ''} />
	</div>
	<div>
		<label class="label" for="details">Details <span class="font-normal text-zinc-500">(optional)</span></label>
		<textarea class="input" id="details" name="details" rows="3" placeholder="Bring your own, pizza at 9">{initial?.details ?? ''}</textarea>
	</div>
	<div>
		<label class="label" for="location">Where <span class="font-normal text-zinc-500">(optional)</span></label>
		<input class="input" id="location" name="location" placeholder="12 Byres Road" value={initial?.location ?? ''} />
	</div>

	{#if data.gaffs.length}
		<div>
			<label class="label" for="gaff">Hosting at a saved gaff? <span class="font-normal text-zinc-500">(optional)</span></label>
			<select class="input" id="gaff" name="gaff" value={initial?.gaffId ?? ''}>
				<option value="">No</option>
				{#each data.gaffs as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
			</select>
		</div>
	{/if}

	<fieldset>
		<legend class="label">When</legend>
		<div class="grid grid-cols-2 gap-2">
			<label class="flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm {mode === 'fixed' ? 'border-brand-500 bg-brand-50' : 'border-zinc-300'}">
				<input type="radio" name="mode" value="fixed" bind:group={mode} />
				I know the date
			</label>
			<label class="flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm {mode === 'poll' ? 'border-brand-500 bg-brand-50' : 'border-zinc-300'}">
				<input type="radio" name="mode" value="poll" bind:group={mode} />
				Date poll
			</label>
		</div>
	</fieldset>

	{#if mode === 'fixed'}
		<div>
			<label class="label" for="starts_at">Date and time</label>
			<input class="input" id="starts_at" name="starts_at" type="datetime-local" required value={initial?.startsAt ?? ''} />
			<p class="mt-1 text-xs text-zinc-500">RSVPs open as soon as you create the event.</p>
		</div>
	{:else}
		<div>
			<span class="label">Date options</span>
			<div class="space-y-2">
				{#each options as _, i (i)}
					<div class="flex gap-2">
						<input class="input" name="option" type="datetime-local" required bind:value={options[i]} aria-label="Date option {i + 1}" />
						{#if data.payday && isLocalDateTime(options[i]) && isJustAfterPayday(options[i], data.payday)}
							<span class="badge shrink-0 self-center bg-lime-100 text-lime-800" title="Within a week of your payday">💷 Payday</span>
						{/if}
						<button type="button" class="btn-secondary btn-small" disabled={options.length <= 2} onclick={() => options.splice(i, 1)} aria-label="Remove option {i + 1}">Remove</button>
					</div>
				{/each}
			</div>
			<button type="button" class="btn-secondary btn-small mt-2" onclick={() => options.push('')}>+ Add another date</button>
			<p class="mt-1 text-xs text-zinc-500">Guests tick every date they can do. RSVPs open once you pick the winner.</p>
		</div>
		<div>
			<label class="flex items-center gap-2 text-sm font-medium text-zinc-700">
				<input type="checkbox" bind:checked={hasDeadline} />
				Set a voting deadline
			</label>
			{#if hasDeadline}
				<input class="input mt-2" name="vote_deadline" type="datetime-local" required aria-label="Voting deadline" value={initial?.voteDeadline ?? ''} />
			{/if}
		</div>
	{/if}

	<button class="btn w-full">Create event</button>
</form>
