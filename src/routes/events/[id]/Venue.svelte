<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const v = $derived(data.venues);
	const most = $derived(Math.max(1, ...v.options.map((o) => o.votes)));
	let error = $state('');
	let adding = $state(false);
	// Shows a failed suggestion or tick here in the card, not at the top of the page.
	const submit: SubmitFunction = () => async ({ update, result }) => {
		if (result.type === 'failure') {
			error = String(result.data?.error ?? 'Something went wrong.');
			return;
		}
		error = '';
		adding = false;
		await update();
	};
</script>

<section class="card space-y-4" id="venue">
	<h2>Where to?</h2>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if v.venue}
		<div class="grid grid-cols-[1fr_auto] border border-lime">
			<div class="min-w-0 px-3 py-3">
				<p class="text-[11px] font-extrabold tracking-widest text-lime uppercase">Going to</p>
				<p class="text-2xl leading-tight font-black break-words">{v.venue}</p>
			</div>
			{#if v.link}
				<a class="flex items-center border-l border-lime px-3 text-[11px] font-extrabold tracking-widest text-hot uppercase hover:bg-zinc-100" href={v.link} target="_blank" rel="noopener noreferrer">Map</a>
			{/if}
		</div>
		{#if data.isHost}
			<form method="POST" action="?/reopenVenue" use:enhance={submit}>
				<button class="text-sm font-semibold text-zinc-500 underline underline-offset-4">Reopen the vote</button>
			</form>
		{/if}
	{:else}
		{#if v.options.length}
			<ul class="divide-y divide-zinc-200 border border-zinc-200">
				{#each v.options as o (o.id)}
					<li>
						<form method="POST" action="?/voteVenue" use:enhance={submit}>
							<input type="hidden" name="option" value={o.id} />
							<input type="hidden" name="up" value={o.mine ? '0' : '1'} />
							<button class="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 text-left {o.mine ? 'bg-lime text-ink' : 'hover:bg-zinc-100'}" aria-pressed={o.mine} aria-label="{o.name}, {o.votes} {o.votes === 1 ? 'person' : 'people'} up for it">
								<span class="min-w-0">
									<span class="block font-extrabold break-words">{o.name}</span>
									<span class="block h-1.5 {o.mine ? 'bg-ink/15' : 'bg-zinc-100'}"><span class="block h-full {o.mine ? 'bg-ink' : 'bg-lime'}" style="width: {(o.votes / most) * 100}%"></span></span>
									{#if o.voters}<span class="mt-1 block text-xs {o.mine ? 'text-ink/70' : 'text-zinc-500'}">{o.voters}</span>{/if}
								</span>
								<span class="text-xl font-black tabular-nums">{o.votes}</span>
							</button>
						</form>
						{#if o.link || data.isHost || o.canRemove}
							<div class="flex border-t border-zinc-200 text-[11px] font-extrabold tracking-widest [&_a]:px-3 [&_a]:py-2.5 [&_a]:uppercase [&_button]:px-3 [&_button]:py-2.5 [&_button]:uppercase">
								{#if o.link}<a class="text-zinc-900" href={o.link} target="_blank" rel="noopener noreferrer" aria-label="Map for {o.name}">Map</a>{/if}
								{#if data.isHost}
									<form method="POST" action="?/lockVenue" use:enhance={submit}>
										<input type="hidden" name="option" value={o.id} />
										<button class="text-hot" aria-label="Pick {o.name} and tell everyone">Pick this</button>
									</form>
								{/if}
								{#if o.canRemove}
									<form method="POST" action="?/removeVenue" use:enhance={submit}>
										<input type="hidden" name="option" value={o.id} />
										<button class="text-zinc-500" aria-label="Remove {o.name}">Remove</button>
									</form>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
			<p class="text-xs text-zinc-500">Tick every place you’d go. The host picks one.</p>
		{:else}
			<p class="text-sm text-zinc-500">Pub, club or somewhere else? Suggest a place and everyone can tick where they’d go.</p>
		{/if}
		{#if adding}
			<form method="POST" action="?/suggestVenue" use:enhance={submit} class="space-y-3">
				<div>
					<label class="label" for="venue_name">Place</label>
					<input class="input" id="venue_name" name="name" maxlength="60" required placeholder="The Ox" />
				</div>
				<div>
					<label class="label" for="venue_link">Map or website link (optional)</label>
					<input class="input" id="venue_link" name="link" type="url" maxlength="500" placeholder="https://maps.app.goo.gl/…" />
				</div>
				<div class="flex items-center gap-3">
					<button class="btn-secondary">Suggest it</button>
					<button type="button" class="text-sm font-semibold text-zinc-500 underline underline-offset-4" onclick={() => ((adding = false), (error = ''))}>Cancel</button>
				</div>
			</form>
		{:else}
			<button type="button" class="btn-secondary" onclick={() => (adding = true)}>Suggest a place</button>
		{/if}
	{/if}
</section>
