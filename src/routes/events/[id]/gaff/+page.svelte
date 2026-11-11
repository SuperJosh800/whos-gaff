<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const me = $derived(page.data.user?.id);
	const details = $derived(
		data.gaff
			? [
					['🏠 Address', data.gaff.address],
					['📜 House rules', data.gaff.house_rules],
					['📶 Wi-Fi', data.gaff.wifi],
					['🧥 Coats', data.gaff.coats],
					['🚗 Parking', data.gaff.parking],
					['📝 Notes', data.gaff.notes]
				].filter(([, v]) => v)
			: []
	);
</script>

{#if form?.error}<p class="error mb-5" role="alert">{form.error}</p>{/if}

<div class="space-y-5">
	{#if data.gaff}
		<section class="card">
			<h2 class="text-lg font-bold">{data.gaff.name}</h2>
			<dl class="mt-3 grid gap-3 sm:grid-cols-2">
				{#each details as [label, value] (label)}
					<div>
						<dt class="text-sm font-semibold text-zinc-500">{label}</dt>
						<dd class="whitespace-pre-line">{value}</dd>
					</div>
				{/each}
			</dl>
		</section>
	{:else if data.addressLocked || (data.event.gaff_id && !data.isHost)}
		<p class="card text-zinc-600">🔒 RSVP “going” to see the address and gaff details.</p>
	{/if}

	<section class="card space-y-3">
		<h2 class="text-lg font-bold">Bring list</h2>
		{#if data.items.length}
			<ul class="divide-y divide-zinc-100">
				{#each data.items as item (item.id)}
					<li class="flex items-center gap-3 py-2">
						<span class="flex-1 {item.claimed_by ? '' : 'font-semibold'}">{item.name}</span>
						{#if item.claimed_by}
							<span class="text-sm text-emerald-700">{item.claimed_by === me ? 'You’re bringing this' : `${item.claimed_by_name} is bringing it`}</span>
						{/if}
						{#if !item.claimed_by || item.claimed_by === me}
							<form method="POST" action="?/claim" use:enhance>
								<input type="hidden" name="item" value={item.id} />
								<button class={item.claimed_by ? 'btn-secondary btn-small' : 'btn btn-small'}>{item.claimed_by ? 'Unclaim' : 'I’ll bring it'}</button>
							</form>
						{/if}
						{#if item.added_by === me || data.isHost}
							<form method="POST" action="?/removeItem" use:enhance>
								<input type="hidden" name="item" value={item.id} />
								<button class="text-xs text-red-700 underline" aria-label="Remove {item.name}">Remove</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-zinc-500">Nothing on the list yet.</p>
		{/if}
		<form method="POST" action="?/addItem" use:enhance class="flex gap-2">
			<input class="input" name="name" placeholder="Ice, mixers, a speaker…" required maxlength="100" aria-label="Item" />
			<button class="btn-secondary shrink-0">Add</button>
		</form>
	</section>

	<section class="card space-y-3">
		<h2 class="text-lg font-bold">Who broke what 🫣</h2>
		{#if data.damage.length}
			<ul class="space-y-2">
				{#each data.damage as d (d.id)}
					<li class="rounded-xl bg-zinc-50 px-3 py-2 text-sm">
						<span class="font-semibold">{d.culprit}</span> broke {d.what}
						<span class="text-xs text-zinc-500">· reported by {d.reported_by_name}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-zinc-500">Nothing broken… yet.</p>
		{/if}
		<form method="POST" action="?/damage" use:enhance class="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
			<input class="input" name="culprit" placeholder="Who" required maxlength="60" aria-label="Who" />
			<input class="input" name="what" placeholder="What (e.g. the good glass)" required maxlength="200" aria-label="What" />
			<button class="btn-secondary">Log it</button>
		</form>
	</section>
</div>
