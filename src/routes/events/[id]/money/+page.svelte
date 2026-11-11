<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const me = $derived(page.data.user?.id);
	const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;
	const names = $derived(new Map(data.kitty.people.map((p) => [p.id, p.name])));
	const next = $derived(data.rounds.next);
</script>

{#if form?.error}<p class="error mb-5" role="alert">{form.error}</p>{/if}

<div class="space-y-5">
	<section class="card space-y-4">
		<h2 class="text-lg font-bold">Rounds 🍻</h2>
		{#if next}
			<div class="flex flex-wrap items-center gap-3 rounded-xl bg-brand-50 px-4 py-3">
				<p class="text-lg">Next round: <strong>{next.id === me ? 'You!' : next.name}</strong></p>
				<form method="POST" action="?/round" use:enhance class="ml-auto flex gap-2">
					<input type="hidden" name="for" value={next.id} />
					<button class="btn btn-small" name="skipped" value="0">Got it in</button>
					<button class="btn-secondary btn-small" name="skipped" value="1">Skipped it 👀</button>
				</form>
			</div>
			<table class="w-full text-sm">
				<thead><tr class="text-left text-zinc-500"><th class="py-1 font-semibold">Who</th><th class="font-semibold">Bought</th><th class="font-semibold">Skipped</th></tr></thead>
				<tbody>
					{#each data.rounds.tally as t (t.id)}
						<tr class="border-t border-zinc-100">
							<td class="py-1.5">{t.name}{t.id === next.id ? ' ⬅️' : ''}</td>
							<td>{t.bought}</td>
							<td class={t.skipped ? 'font-bold text-red-700' : ''}>{t.skipped}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="text-sm text-zinc-500">Rounds start once people RSVP “going”.</p>
		{/if}
	</section>

	<section class="card space-y-4">
		<div class="flex items-baseline justify-between">
			<h2 class="text-lg font-bold">Kitty</h2>
			<p class="text-sm text-zinc-600">Total {pounds(data.kitty.total)}</p>
		</div>

		{#if data.kitty.transfers.length}
			<ul class="space-y-2">
				{#each data.kitty.transfers as t (`${t.from}-${t.to}`)}
					<li class="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2">
						<span><strong>{t.from === me ? 'You' : t.fromName}</strong> owe{t.from === me ? '' : 's'} <strong>{t.to === me ? 'you' : t.toName}</strong> {pounds(t.amount)}</span>
						<span class="ml-auto flex gap-2">
							{#if t.from === me && t.link}
								<a class="btn btn-small" href={t.link} target="_blank" rel="noopener noreferrer">Pay by bank ↗</a>
							{:else if t.from === me}
								<span class="text-xs text-zinc-500">{t.toName} hasn’t added a payment link</span>
							{/if}
							{#if t.from === me || t.to === me}
								<form method="POST" action="?/settle" use:enhance>
									<input type="hidden" name="from" value={t.from} />
									<input type="hidden" name="to" value={t.to} />
									<button class="btn-secondary btn-small">Mark paid</button>
								</form>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{:else if data.kitty.expenses.length}
			<p class="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">All square ✅</p>
		{/if}

		{#if data.kitty.expenses.length}
			<ul class="divide-y divide-zinc-100 text-sm">
				{#each data.kitty.expenses as e (e.id)}
					<li class="flex justify-between gap-3 py-2">
						<span><strong>{e.payer}</strong> paid for {e.description}
							<span class="block text-xs text-zinc-500">split between {e.shares.map((id) => names.get(id)).join(', ')}</span></span>
						<span class="font-semibold">{pounds(e.amount_pence)}</span>
					</li>
				{/each}
			</ul>
		{/if}

		<form method="POST" action="?/expense" use:enhance class="space-y-3 border-t border-zinc-100 pt-4">
			<p class="text-sm font-semibold text-zinc-700">I paid for…</p>
			<div class="grid gap-2 sm:grid-cols-[2fr_1fr]">
				<input class="input" name="description" placeholder="Taxi, drinks, pizza…" required aria-label="What for" />
				<input class="input" name="amount" inputmode="decimal" placeholder="£0.00" required aria-label="Amount" />
			</div>
			<fieldset class="flex flex-wrap gap-2">
				<legend class="mb-1 text-sm text-zinc-600">Split between</legend>
				{#each data.kitty.people as p (p.id)}
					<label class="flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
						<input type="checkbox" name="share" value={p.id} checked={data.kitty.defaultShares.includes(p.id)} />
						{p.name}
					</label>
				{/each}
			</fieldset>
			<button class="btn">Add cost</button>
		</form>
		<p class="text-xs text-zinc-500">Add your Monzo.me or other payment link on <a class="font-semibold text-brand-700" href="/profile">your profile</a> so people can pay you by bank transfer.</p>
	</section>
</div>
