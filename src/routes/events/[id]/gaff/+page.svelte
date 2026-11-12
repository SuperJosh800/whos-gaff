<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const me = $derived(page.data.user?.id);
	const details = $derived(
		data.gaff
			? [
					['Address', data.gaff.address],
					['House rules', data.gaff.house_rules],
					['Wi-Fi', data.gaff.wifi],
					['Coats', data.gaff.coats],
					['Parking', data.gaff.parking],
					['Notes', data.gaff.notes]
				].filter(([, v]) => v)
			: []
	);
</script>

{#if form?.error}<p class="error mb-5" role="alert">{form.error}</p>{/if}

<div class="space-y-5">
	{#if data.gaff}
		<section class="card">
			<h2>{data.gaff.name}</h2>
			<dl class="mt-3 divide-y divide-zinc-200 border border-zinc-200">
				{#each details as [label, value] (label)}
					<div class="grid grid-cols-[7rem_1fr] text-sm">
						<dt class="border-r border-zinc-200 px-3 py-2.5 text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase">{label}</dt>
						<dd class="min-w-0 px-3 py-2.5 whitespace-pre-line">{value}</dd>
					</div>
				{/each}
			</dl>
		</section>
	{:else if data.addressLocked || (data.event.gaff_id && !data.isHost)}
		<p class="card text-zinc-600">RSVP “going” to see the address and gaff details.</p>
	{/if}

	<section class="card space-y-3">
		<h2>Bring list</h2>
		{#if data.items.length}
			<ul class="divide-y divide-zinc-200 border border-zinc-200">
				{#each data.items as item (item.id)}
					<li class="flex items-center gap-3 py-1.5 pl-3 pr-1.5 text-sm">
						<span class="flex-1 {item.claimed_by ? '' : 'font-semibold'}">{item.name}</span>
						{#if item.claimed_by}
							<span class="text-sm text-emerald-700">{item.claimed_by === me ? 'You’re bringing this' : `${item.claimed_by_name} is bringing it`}</span>
						{/if}
						{#if !item.claimed_by || item.claimed_by === me}
							<form method="POST" action="?/claim" use:enhance>
								<input type="hidden" name="item" value={item.id} />
								<button class="text-[11px] font-extrabold tracking-widest uppercase underline underline-offset-4 {item.claimed_by ? 'text-zinc-500' : 'text-hot'}">{item.claimed_by ? 'Unclaim' : 'I’ll bring it'}</button>
							</form>
						{/if}
						{#if item.added_by === me || data.isHost}
							<form method="POST" action="?/removeItem" use:enhance>
								<input type="hidden" name="item" value={item.id} />
								<button class="h-8 w-8 text-lg text-zinc-500 hover:text-hot" aria-label="Remove {item.name}">×</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-zinc-500">Nothing on the list yet.</p>
		{/if}
		<form method="POST" action="?/addItem" use:enhance class="joined">
			<input class="input" name="name" placeholder="Ice, mixers, a speaker…" required maxlength="100" aria-label="Item" />
			<button class="btn-secondary shrink-0">Add</button>
		</form>
	</section>

	<section class="card space-y-3">
		<h2>Who broke what</h2>
		{#if data.damage.length}
			<ul class="divide-y divide-zinc-200 border border-zinc-200">
				{#each data.damage as d (d.id)}
					<li class="px-3 py-2.5 text-sm">
						<span class="font-semibold">{d.culprit}</span> broke {d.what}
						<span class="text-xs text-zinc-500">· reported by {d.reported_by_name}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-zinc-500">Nothing broken… yet.</p>
		{/if}
		<form method="POST" action="?/damage" use:enhance class="grid border border-zinc-200 sm:grid-cols-[1fr_2fr_auto] [&>*]:border-0 [&>*+*]:border-t [&>*+*]:border-zinc-200 sm:[&>*+*]:border-t-0 sm:[&>*+*]:border-l">
			<input class="input" name="culprit" placeholder="Who" required maxlength="60" aria-label="Who" />
			<input class="input" name="what" placeholder="What (e.g. the good glass)" required maxlength="200" aria-label="What" />
			<button class="btn-secondary">Log it</button>
		</form>
	</section>
</div>
