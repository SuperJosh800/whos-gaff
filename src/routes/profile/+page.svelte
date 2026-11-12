<script lang="ts">
	import { enhance } from '$app/forms';
	import HallOfFame from '../people/[id]/HallOfFame.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<div class="mx-auto max-w-lg space-y-4">
	<h1 class="text-2xl font-bold">Your profile</h1>
	<form method="POST" action="?/profile" use:enhance={() => async ({ update }) => update({ reset: false })} class="card space-y-4">
		{#if form?.section === 'profile' && form.error}<p class="error">{form.error}</p>{/if}
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
			{#if form?.section === 'profile' && 'saved' in form}<span class="text-sm text-emerald-700">Saved.</span>{/if}
		</div>
	</form>
	<HallOfFame entries={data.hallOfFame} />

	<section class="card space-y-4" aria-labelledby="security">
		<h2 id="security" class="text-lg font-bold">Password and devices</h2>
		<p class="text-sm text-zinc-600">Signed in as <strong>{data.profile.email}</strong>.</p>
		<form method="POST" action="?/password" use:enhance class="space-y-3">
			{#if form?.section === 'password' && form.error}<p class="error">{form.error}</p>{/if}
			<div>
				<label class="label" for="current">Current password</label>
				<input class="input" id="current" name="current" type="password" required autocomplete="current-password" />
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label class="label" for="new">New password</label>
					<input class="input" id="new" name="new" type="password" required minlength="8" maxlength="200" autocomplete="new-password" />
				</div>
				<div>
					<label class="label" for="confirm">Type it again</label>
					<input class="input" id="confirm" name="confirm" type="password" required minlength="8" maxlength="200" autocomplete="new-password" />
				</div>
			</div>
			<div class="flex items-center gap-3">
				<button class="btn-secondary">Change password</button>
				{#if form?.section === 'password' && 'saved' in form}<span class="text-sm text-emerald-700">Changed. Other devices are logged out.</span>{/if}
			</div>
		</form>
		<form method="POST" action="?/logoutOthers" use:enhance class="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
			<button class="btn-secondary">Log out other devices</button>
			{#if form?.section === 'sessions'}<span class="text-sm text-emerald-700">Done. Only this device is logged in.</span>{/if}
		</form>
	</section>

	<section class="card space-y-3" aria-labelledby="your-data">
		<h2 id="your-data" class="text-lg font-bold">Your data</h2>
		<p class="text-sm text-zinc-600">See what we keep in the <a class="font-semibold text-brand-700 underline" href="/privacy">privacy policy</a>.</p>
		<div class="flex flex-wrap gap-3">
			<a class="btn-secondary" href="/profile/export" download>Download my data</a>
			<a class="btn-secondary text-red-700" href="/profile/delete">Delete my account</a>
		</div>
	</section>
	<form method="POST" action="/logout" class="sm:hidden">
		<button class="btn-secondary w-full">Log out</button>
	</form>
</div>
