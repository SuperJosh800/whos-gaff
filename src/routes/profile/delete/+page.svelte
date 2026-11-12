<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Delete your account · Who's Gaff</title></svelte:head>

<div class="mx-auto max-w-lg space-y-4">
	<h1 class="text-4xl">Delete your account</h1>
	<div class="card space-y-3 text-sm">
		<p>This can’t be undone. When you delete your account:</p>
		<ul class="list-disc space-y-1 pl-5">
			<li>Your name, email, password, payment link and payday are deleted.</li>
			<li>Your gaff profiles, chat messages, photos, votes, RSVPs, getting-home plans and group memberships are deleted.</li>
			{#if data.hosting}
				<li>The {data.hosting === 1 ? 'event you host passes' : `${data.hosting} events you host pass`} to the person who joined earliest. An event nobody else has joined is deleted.</li>
			{/if}
			<li>Kitty payments, rounds and bring-list items stay so everyone else’s totals still add up, but they show as “Deleted user”.</li>
		</ul>
		<p>Want a copy first? <a class="text-hot underline underline-offset-4" href="/profile/export" download>Download your data</a>.</p>
	</div>
	<form method="POST" class="card space-y-4">
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<div>
			<label class="label" for="password">Your password</label>
			<input class="input" id="password" name="password" type="password" required autocomplete="current-password" />
		</div>
		<div>
			<label class="label" for="confirm">Type DELETE to confirm</label>
			<input class="input" id="confirm" name="confirm" required autocomplete="off" pattern="DELETE" />
		</div>
		<div class="flex flex-wrap gap-3">
			<button class="btn">Delete my account</button>
			<a class="btn-secondary" href="/profile">Cancel</a>
		</div>
	</form>
</div>
