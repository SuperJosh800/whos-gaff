<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const me = $derived(page.data.user?.id);
	const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;
	const names = $derived(new Map(data.kitty.people.map((p) => [p.id, p.name])));
	const amGoing = $derived(data.going.some((p) => p.id === me));
	const amDriving = $derived(data.drivers.some((d) => d.id === me));
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
						<p class="text-sm text-zinc-500">Everyone in this round is driving, so there’s nobody to buy.</p>
					{/if}
					<table class="w-full text-sm">
						<thead><tr class="text-left text-[11px] tracking-widest text-zinc-500 uppercase"><th class="py-1 font-extrabold">Who</th><th class="font-extrabold">Bought</th><th class="font-extrabold">Skipped</th></tr></thead>
						<tbody>
							{#each round.tally as t (t.id)}
								<tr class="border-t border-zinc-200">
									<td class="py-1.5 {t.id === next?.id ? 'font-extrabold text-lime' : ''}">{t.name}{t.id === next?.id ? ' (next)' : ''}{#if t.driving}<span class="text-zinc-500">{' (driving)'}</span>{/if}</td>
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
