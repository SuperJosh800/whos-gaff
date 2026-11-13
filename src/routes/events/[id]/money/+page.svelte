<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const me = $derived(page.data.user?.id);
	const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;
	const names = $derived(new Map(data.kitty.people.map((p) => [p.id, p.name])));
	const amGoing = $derived(data.going.some((p) => p.id === me));
	const amDriving = $derived(data.drivers.some((d) => d.id === me));
	const ta = $derived(data.takeaway.order);
	const myItem = $derived(ta?.items.find((i) => i.user_id === me));
	let takeawayError = $state('');
	// An error about the order goes once the order changes under it.
	$effect(() => {
		void data.takeaway;
		takeawayError = '';
	});
	let busy = $state(false);
	// Shows a failed takeaway action here in the section rather than at the top of the page.
	const inTakeaway: SubmitFunction = () => {
		busy = true;
		return async ({ update, result }) => {
			busy = false;
			if (result.type !== 'failure') await update({ reset: false });
			takeawayError = result.type === 'failure' ? String(result.data?.error ?? 'Something went wrong.') : '';
		};
	};
</script>

{#if form?.error}<p class="error mb-5" role="alert">{form.error}</p>{/if}

<div class="space-y-5">
	<section class="card space-y-4">
		<h2>Rounds</h2>
		{#if data.isHost && data.going.length}
			<div class="space-y-2">
				<p class="label !mb-0">Driving tonight</p>
				<div class="flex flex-wrap gap-2">
					{#each data.going as p (p.id)}
						{@const on = data.drivers.some((d) => d.id === p.id)}
						<form method="POST" action="?/driving" use:enhance>
							<input type="hidden" name="who" value={p.id} />
							<input type="hidden" name="driving" value={on ? '0' : '1'} />
							<button class="border px-3 py-1.5 text-xs font-extrabold tracking-widest uppercase {on ? 'border-lime bg-lime text-ink' : 'border-zinc-300 hover:bg-zinc-100'}" aria-pressed={on}>{p.id === me ? 'You' : p.name}</button>
						</form>
					{/each}
				</div>
			</div>
		{:else if amGoing || data.drivers.length}
			<div class="grid grid-cols-[1fr_auto] items-center border border-zinc-200">
				<p class="min-w-0 px-3 py-2.5 text-sm">
					<span class="block text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase">Driving tonight</span>
					{data.drivers.length ? data.drivers.map((d) => (d.id === me ? 'You' : d.name)).join(', ') : 'Nobody yet'}
				</p>
				{#if amGoing}
					<form method="POST" action="?/driving" use:enhance class="self-stretch">
						<input type="hidden" name="who" value={me} />
						<input type="hidden" name="driving" value={amDriving ? '0' : '1'} />
						<button class="h-full border-l border-zinc-200 px-3 text-[11px] font-extrabold tracking-widest uppercase {amDriving ? 'bg-lime text-ink' : 'hover:bg-zinc-100'}" aria-pressed={amDriving}>I’m driving</button>
					</form>
				{/if}
			</div>
		{/if}
		{#if data.drivers.length}<p class="text-xs text-zinc-500">Drivers are passed over when it’s their turn for a round.</p>{/if}
		{#each data.rounds as round, i (round.id ?? 'main')}
			{@const next = round.next}
			{@const mine = round.tally.some((t) => t.id === me)}
			<div class="space-y-3 {i ? 'border-t border-zinc-200 pt-4' : ''}">
				{#if data.rounds.length > 1}
					<div class="flex items-baseline justify-between gap-3">
						<p class="label">{round.id === null ? 'Main round' : `Round with ${round.tally.map((t) => (t.id === me ? 'you' : t.name)).join(', ')}`}</p>
						{#if round.id !== null && mine}
							<form method="POST" action="?/leaveRound" use:enhance>
								<input type="hidden" name="group" value={round.id} />
								<button class="text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase hover:text-zinc-900">Leave</button>
							</form>
						{/if}
					</div>
				{/if}
				{#if round.id === null && round.tally.length < 2 && data.rounds.length > 1}
					<p class="text-sm text-zinc-500">Just {round.tally[0].id === me ? 'you' : round.tally[0].name} left in the main round.</p>
				{:else}
					{#if next}
						<div class="border border-zinc-200">
							<p class="px-3 py-3"><span class="block text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase">Next round</span>
								<span class="text-2xl font-black uppercase {next.id === me ? 'text-hot' : 'text-lime'}">{next.id === me ? 'You' : next.name}</span></p>
							<form method="POST" action="?/round" use:enhance class="strip border-0 border-t">
								<button name="skipped" value="0">Got it in</button>
								<button name="skipped" value="1">Skipped it</button>
								<input type="hidden" name="for" value={next.id} />
								<input type="hidden" name="group" value={round.id ?? ''} />
							</form>
						</div>
					{:else}
						<p class="text-sm text-zinc-500">Everyone in this round is driving or has left, so there’s nobody to buy.</p>
					{/if}
					<table class="w-full text-sm">
						<thead><tr class="text-left text-[11px] tracking-widest text-zinc-500 uppercase"><th class="py-1 font-extrabold">Who</th><th class="font-extrabold">Bought</th><th class="font-extrabold">Skipped</th></tr></thead>
						<tbody>
							{#each round.tally as t (t.id)}
								<tr class="border-t border-zinc-200">
									<td class="py-1.5 {t.id === next?.id ? 'font-extrabold text-lime' : ''}">{t.name}{t.id === next?.id ? ' (next)' : ''}{#if t.gone}<span class="text-zinc-500">{' (left)'}</span>{:else if t.driving}<span class="text-zinc-500">{' (driving)'}</span>{/if}</td>
									<td>{t.bought}</td>
									<td class={t.skipped ? 'font-bold text-red-700' : ''}>{t.skipped}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		{:else}
			<p class="text-sm text-zinc-500">Rounds start once people RSVP “going”.</p>
		{/each}

		{#if data.going.length > 2}
			<details class="border-t border-zinc-200 pt-4">
				<summary class="cursor-pointer text-[11px] font-extrabold tracking-widest text-hot uppercase">Split off a smaller round</summary>
				<form method="POST" action="?/roundGroup" use:enhance class="mt-3 space-y-3">
					<p class="text-sm text-zinc-600">Just buying for a few of you? Pick who’s in. Everyone else stays in the main round.</p>
					<fieldset class="flex flex-wrap gap-2">
						<legend class="sr-only">Who’s in this round</legend>
						{#each data.going as p (p.id)}
							<label class="flex cursor-pointer items-center gap-1.5 border border-zinc-300 px-3 py-1.5 text-xs font-extrabold tracking-widest uppercase has-[:checked]:border-lime has-[:checked]:bg-lime has-[:checked]:text-ink has-focus-visible:outline-2 has-focus-visible:outline-hot">
								<input class="sr-only" type="checkbox" name="member" value={p.id} checked={p.id === me} />
								{p.id === me ? 'You' : p.name}
							</label>
						{/each}
					</fieldset>
					<button class="btn">Start this round</button>
				</form>
			</details>
		{/if}
	</section>

	<section class="card space-y-4" id="takeaway">
		<h2>Takeaway</h2>
		{#if takeawayError}<p class="error" role="alert">{takeawayError}</p>{/if}
		{#if ta && !ta.ordered_at}
			<div class="border border-zinc-200">
				<div class="flex items-baseline justify-between gap-3 px-3 py-2.5">
					<p class="min-w-0"><span class="block text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase">{ta.started_by === me ? 'You' : ta.by} started an order from</span>
						<span class="text-2xl leading-tight font-black uppercase">{ta.place}</span></p>
					{#if ta.canCancel}
						<form method="POST" action="?/cancelTakeaway" use:enhance={inTakeaway}>
							<input type="hidden" name="takeaway" value={ta.id} />
							<!-- The confirm is on the click: enhance sends the form even when a submit handler prevents it. -->
							<button class="text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase hover:text-zinc-900" onclick={(e) => { if (!confirm('Call off the takeaway?')) e.preventDefault(); }}>Call it off</button>
						</form>
					{/if}
				</div>
				{#if ta.items.length}
					<ul class="divide-y divide-zinc-200 border-t border-zinc-200 text-sm">
						{#each ta.items as i (i.user_id)}
							<li class="flex justify-between gap-3 px-3 py-2">
								<span class="min-w-0 break-words"><strong class={i.user_id === me ? 'text-lime' : ''}>{i.user_id === me ? 'You' : i.name}</strong> · {i.item}</span>
								<span class="shrink-0 tabular-nums {i.price_pence ? '' : 'text-zinc-500'}">{i.price_pence ? pounds(i.price_pence) : 'No price'}</span>
							</li>
						{/each}
					</ul>
					<p class="border-t border-zinc-200 px-3 py-2 text-xs text-zinc-500">{ta.items.length} {ta.items.length === 1 ? 'order' : 'orders'}{ta.priced ? ` · ${pounds(ta.priced)} priced so far` : ''}</p>
				{:else}
					<p class="border-t border-zinc-200 px-3 py-2 text-sm text-zinc-500">Nobody’s added anything yet.</p>
				{/if}
			</div>

			{#if amGoing}
				<form method="POST" action="?/takeawayItem" use:enhance={inTakeaway} class="space-y-2">
					<input type="hidden" name="takeaway" value={ta.id} />
					<p class="label !mb-0">{myItem ? 'Your order' : 'What do you want?'}</p>
					<div class="grid grid-cols-[2fr_1fr] [&>*+*]:border-l-0">
						<input class="input" name="item" maxlength="100" required value={myItem?.item ?? ''} placeholder="Chicken burger, chips" aria-label="Your order" />
						<input class="input" name="price" inputmode="decimal" value={myItem?.price_pence ? (myItem.price_pence / 100).toFixed(2) : ''} placeholder="£ if known" aria-label="Price (optional)" />
					</div>
					<div class="flex items-center gap-4">
						<button class="btn">{myItem ? 'Change it' : 'Add mine'}</button>
						<!-- Not name="remove": that would hide the form's own remove(), which Svelte calls when the form goes. -->
						{#if myItem}<button class="text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase hover:text-zinc-900" name="takeOut" value="1" formnovalidate>Take mine out</button>{/if}
					</div>
				</form>
			{:else if myItem}
				<form method="POST" action="?/takeawayItem" use:enhance={inTakeaway} class="flex items-center justify-between gap-3">
					<input type="hidden" name="takeaway" value={ta.id} />
					<p class="text-sm text-zinc-500">You’re not going any more, but your order’s still in.</p>
					<button class="btn-secondary btn-small shrink-0" name="takeOut" value="1">Take mine out</button>
				</form>
			{/if}

			{#if ta.orderer_id === me}
				<form method="POST" action="?/placeOrder" use:enhance={inTakeaway} class="space-y-2 border-t border-zinc-200 pt-4">
					<input type="hidden" name="takeaway" value={ta.id} />
					<p class="label !mb-0">You’re ordering. Once it’s done, what did you pay?</p>
					<div class="joined">
						<input class="input" name="total" inputmode="decimal" required placeholder="£0.00" aria-label="What you paid in total" />
						<button class="btn shrink-0" disabled={busy}>Ordered it</button>
					</div>
					<p class="text-xs text-zinc-500">Priced items go in the kitty for whoever ordered them. The rest, like delivery, is split between everyone in the order.</p>
				</form>
				<form method="POST" action="?/takeawayOrderer" use:enhance={inTakeaway}>
					<input type="hidden" name="takeaway" value={ta.id} />
					<input type="hidden" name="ordering" value="0" />
					<button class="text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase hover:text-zinc-900">I can’t order it after all</button>
				</form>
			{:else if ta.orderer_id}
				<p class="text-sm"><strong class="text-lime">{ta.orderer}</strong> is ordering it.</p>
			{:else if amGoing}
				<form method="POST" action="?/takeawayOrderer" use:enhance={inTakeaway} class="flex items-center justify-between gap-3 border-t border-zinc-200 pt-4">
					<input type="hidden" name="takeaway" value={ta.id} />
					<input type="hidden" name="ordering" value="1" />
					<p class="text-sm text-zinc-500">Nobody’s ordering yet.</p>
					<button class="btn shrink-0">I’ll order</button>
				</form>
			{:else}
				<p class="text-sm text-zinc-500">Nobody’s ordering yet.</p>
			{/if}
		{:else}
			{#if ta}
				<div class="grid grid-cols-[1fr_auto] items-center border border-zinc-200">
					<p class="min-w-0 px-3 py-2.5 text-sm"><span class="block text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase">Last takeaway · in the kitty</span>
						<strong>{ta.orderer_id === me ? 'You' : (ta.orderer ?? 'Someone')}</strong> ordered from {ta.place}</p>
					<span class="border-l border-zinc-200 px-3 py-2.5 text-right text-sm font-semibold tabular-nums">{pounds(ta.total_pence ?? 0)}
						{#if myItem?.share != null}<span class="block text-xs font-normal text-zinc-500">yours {pounds(myItem.share)}</span>{/if}</span>
				</div>
			{/if}
			{#if data.takeaway.canStart}
				<form method="POST" action="?/startTakeaway" use:enhance={inTakeaway} class="joined">
					<input class="input" name="place" maxlength="60" required placeholder="Where from?" aria-label="Where the takeaway’s from" />
					<button class="btn shrink-0">Start an order</button>
				</form>
				<p class="text-xs text-zinc-500">Everyone going adds what they want, one of you orders, and the cost goes in the kitty.</p>
			{:else}
				<p class="text-sm text-zinc-500">RSVP “going” to start a takeaway order.</p>
			{/if}
		{/if}
	</section>

	<section class="card space-y-4">
		<div class="flex items-baseline justify-between">
			<h2>Kitty</h2>
			<p class="text-sm text-zinc-600">Total {pounds(data.kitty.total)}</p>
		</div>

		{#if data.kitty.transfers.length}
			<ul class="divide-y divide-zinc-200 border border-zinc-200">
				{#each data.kitty.transfers as t (`${t.from}-${t.to}`)}
					<li class="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
						<span><strong>{t.from === me ? 'You' : t.fromName}</strong> owe{t.from === me ? '' : 's'} <strong>{t.to === me ? 'you' : t.toName}</strong> {pounds(t.amount)}</span>
						<span class="ml-auto flex gap-2">
							{#if t.from === me && t.link}
								<a class="btn btn-small" href={t.link} target="_blank" rel="noopener noreferrer">Pay by bank</a>
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
			<p class="badge text-lime">All square</p>
		{/if}

		{#if data.kitty.expenses.length}
			<ul class="divide-y divide-zinc-200 border border-zinc-200 text-sm">
				{#each data.kitty.expenses as e (e.id)}
					<li class="flex justify-between gap-3 px-3 py-2.5">
						<span><strong>{e.payer}</strong> paid for {e.description}
							<span class="block text-xs text-zinc-500">split between {e.shares.map((id) => names.get(id)).join(', ')}</span></span>
						<span class="font-semibold">{pounds(e.amount_pence)}</span>
					</li>
				{/each}
			</ul>
		{/if}

		<form method="POST" action="?/expense" use:enhance class="space-y-3 border-t border-zinc-200 pt-4">
			<p class="label">I paid for</p>
			<div class="grid grid-cols-[2fr_1fr] [&>*+*]:border-l-0">
				<input class="input" name="description" placeholder="Taxi, drinks, pizza…" required aria-label="What for" />
				<input class="input" name="amount" inputmode="decimal" placeholder="£0.00" required aria-label="Amount" />
			</div>
			<fieldset class="flex flex-wrap gap-2">
				<legend class="label">Split between</legend>
				{#each data.kitty.people as p (p.id)}
					<label class="flex cursor-pointer items-center gap-1.5 border border-zinc-300 px-3 py-1.5 text-xs font-extrabold tracking-widest uppercase has-[:checked]:border-lime has-[:checked]:bg-lime has-[:checked]:text-ink has-focus-visible:outline-2 has-focus-visible:outline-hot">
						<input class="sr-only" type="checkbox" name="share" value={p.id} checked={data.kitty.defaultShares.includes(p.id)} />
						{p.name}
					</label>
				{/each}
			</fieldset>
			<button class="btn">Add cost</button>
		</form>
		<p class="text-xs text-zinc-500">Add your Monzo.me or other payment link on <a class="font-semibold text-hot underline underline-offset-4" href="/profile">your profile</a> so people can pay you by bank transfer.</p>
	</section>
</div>
