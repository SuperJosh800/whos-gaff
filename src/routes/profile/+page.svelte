<script lang="ts">
	import { enhance } from '$app/forms';
	import HallOfFame from '../people/[id]/HallOfFame.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<div class="mx-auto max-w-lg space-y-4">
	<h1 class="text-2xl font-bold">Your profile</h1>
	<form method="POST" use:enhance={() => async ({ update }) => update({ reset: false })} class="card space-y-4">
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<div>
			<label class="label" for="name">Name</label>
			<input class="input" id="name" name="name" required value={data.profile.name} />
		</div>
		<div>
			<label class="label" for="payment_link">Payment link</label>
			<input class="input" id="payment_link" name="payment_link" type="url" placeholder="https://monzo.me/yourname" value={data.profile.payment_link} />
			<p class="mt-1 text-xs text-zinc-500">Used for “Pay by bank” when people owe you from the kitty. Monzo.me links get the amount filled in.</p>
		</div>
		<div>
			<label class="label" for="payday">Payday <span class="font-normal text-zinc-500">(day of the month)</span></label>
			<input class="input w-32" id="payday" name="payday" type="number" min="1" max="31" placeholder="25" value={data.profile.payday ?? ''} />
			<p class="mt-1 text-xs text-zinc-500">Dates just after payday get highlighted when you vote.</p>
		</div>
		<div class="flex items-center gap-3">
			<button class="btn">Save</button>
			{#if form && 'saved' in form}<span class="text-sm text-emerald-700">Saved.</span>{/if}
		</div>
	</form>
	<HallOfFame entries={data.hallOfFame} />
	<form method="POST" action="/logout" class="sm:hidden">
		<button class="btn-secondary w-full">Log out</button>
	</form>
</div>
