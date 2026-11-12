<script lang="ts">
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<svelte:head><title>Reset your password · Who's Gaff</title></svelte:head>

<div class="mx-auto max-w-sm">
	<h1 class="mb-4 text-4xl">Forgotten your password?</h1>
	{#if form && 'sent' in form}
		<div class="card space-y-3">
			<p>If there’s an account for <strong>{form.email}</strong>, we’ve emailed it a link to set a new password. The link works for an hour.</p>
			<p class="text-sm text-zinc-500">Nothing arrived? Check your spam folder, or ask whoever runs this Who's Gaff whether email is set up.</p>
		</div>
	{:else}
		<form method="POST" class="card space-y-4">
			{#if form?.error}<p class="error">{form.error}</p>{/if}
			<p class="text-sm text-zinc-600">Enter the email you signed up with and we’ll send you a link to set a new password.</p>
			<div>
				<label class="label" for="email">Email</label>
				<input class="input" id="email" name="email" type="email" required value={form?.email ?? ''} autocomplete="email" />
			</div>
			<button class="btn w-full">Send reset link</button>
		</form>
	{/if}
	<p class="mt-4 text-center text-sm text-zinc-600"><a class="text-hot underline underline-offset-4" href="/login">Back to log in</a></p>
</div>
