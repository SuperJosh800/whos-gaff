<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Set a new password · Who's Gaff</title></svelte:head>

<div class="mx-auto max-w-sm">
	<h1 class="mb-4 text-4xl">Set a new password</h1>
	{#if data.valid}
		<form method="POST" class="card space-y-4">
			{#if form?.error}<p class="error">{form.error}</p>{/if}
			<div>
				<label class="label" for="password">New password</label>
				<input class="input" id="password" name="password" type="password" required minlength="8" maxlength="200" autocomplete="new-password" />
			</div>
			<div>
				<label class="label" for="confirm">Type it again</label>
				<input class="input" id="confirm" name="confirm" type="password" required minlength="8" maxlength="200" autocomplete="new-password" />
			</div>
			<p class="text-xs text-zinc-500">This logs you out on every other device.</p>
			<button class="btn w-full">Save and log in</button>
		</form>
	{:else}
		<div class="card space-y-3">
			<p>This reset link has expired or has already been used.</p>
			<a class="btn" href="/forgot">Send a new link</a>
		</div>
	{/if}
</div>
