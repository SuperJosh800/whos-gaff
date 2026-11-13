<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data, nudged }: { data: PageData; nudged?: number } = $props();
	const t = $derived(data.tickets);
	const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;
	let editing = $state(false);
	const keep = () => async ({ update, result }: { update: (o?: { reset?: boolean }) => Promise<void>; result: { type: string } }) => {
		await update({ reset: false });
		if (result.type === 'success') editing = false;
	};
</script>

{#if t || data.isHost}
	<section class="card space-y-4">
		<h2>Tickets</h2>
		{#if t && !editing}
			<div class="grid grid-cols-[1fr_auto] border border-zinc-200">
				<div class="min-w-0 px-3 py-2.5">
					<p class="text-2xl leading-none font-black">{t.price_pence ? pounds(t.price_pence) : 'Price TBC'}</p>
					{#if t.note}<p class="mt-1 text-sm text-zinc-600">{t.note}</p>{/if}
				</div>
				{#if t.url}
					<a class="flex items-center border-l border-zinc-200 px-3 text-[11px] font-extrabold tracking-widest text-hot uppercase hover:bg-zinc-100" href={t.url} target="_blank" rel="noopener noreferrer">Buy tickets</a>
				{/if}
			</div>

			{#if t.going}
				<form method="POST" action="?/ticket" use:enhance class="strip">
					<button name="have" value="1" aria-pressed={t.mine}>Got my ticket</button>
					<button name="have" value="0" aria-pressed={!t.mine}>Still need one</button>
				</form>
			{:else}
				<p class="text-sm text-zinc-500">RSVP “going” to mark your ticket.</p>
			{/if}

			<div class="grid grid-cols-2 border border-zinc-200">
				<div class="p-3">
					<p class="text-[11px] font-extrabold tracking-widest text-emerald-700 uppercase">Got one</p>
					<p class="text-2xl leading-none font-black">{t.have.length}</p>
					<ul class="mt-1 space-y-0.5 text-sm text-zinc-700">{#each t.have as p (p.id)}<li>{p.name}</li>{/each}</ul>
				</div>
				<div class="border-l border-zinc-200 p-3">
					<p class="text-[11px] font-extrabold tracking-widest text-amber-700 uppercase">Still need one</p>
					<p class="text-2xl leading-none font-black">{t.need.length}</p>
					<ul class="mt-1 space-y-0.5 text-sm text-zinc-700">{#each t.need as p (p.id)}<li>{p.name}</li>{/each}</ul>
				</div>
			</div>

			{#if data.isHost}
				<div class="flex flex-wrap items-center gap-3">
					{#if !t.canNudge}
						<span class="text-sm text-zinc-500" role="status">{nudged ? `Nudged ${nudged} ${nudged === 1 ? 'person' : 'people'}.` : 'Nudged in the last hour.'}</span>
					{:else if t.need.some((p) => p.id !== data.event.host_id)}
						<form method="POST" action="?/nudgeTickets" use:enhance>
							<button class="btn-small">Nudge the rest</button>
						</form>
					{/if}
					<button type="button" class="text-sm font-semibold text-zinc-500 underline underline-offset-4" onclick={() => (editing = true)}>Edit tickets</button>
				</div>
			{/if}
		{:else}
			<form method="POST" action="?/tickets" use:enhance={keep} class="space-y-3">
				<div>
					<label class="label" for="ticket_url">Ticket link</label>
					<input class="input" id="ticket_url" name="url" type="url" placeholder="https://…" value={t?.url ?? ''} />
				</div>
				<div>
					<label class="label" for="ticket_price">Price each</label>
					<input class="input max-w-32" id="ticket_price" name="price" inputmode="decimal" placeholder="£0.00" value={t?.price_pence ? (t.price_pence / 100).toFixed(2) : ''} />
				</div>
				<div>
					<label class="label" for="ticket_note">Entry note</label>
					<input class="input" id="ticket_note" name="note" maxlength="200" placeholder="Last entry 11:30, ID needed" value={t?.note ?? ''} />
				</div>
				<div class="flex flex-wrap items-center gap-3">
					<button class="btn">{t ? 'Save tickets' : 'Add tickets'}</button>
					{#if t}
						<button type="button" class="text-sm font-semibold text-zinc-500 underline underline-offset-4" onclick={() => (editing = false)}>Cancel</button>
					{/if}
				</div>
				<p class="text-xs text-zinc-500">Going to a club? Add where to buy and everyone going can mark when they’ve got theirs. Clear every box and save to remove them.</p>
			</form>
		{/if}
	</section>
{/if}
