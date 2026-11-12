<script lang="ts">
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	const next = page.url.searchParams.get('next');
</script>

<div class="mx-auto max-w-sm">
	<h1 class="mb-4 text-2xl font-bold">Log in</h1>
	<form method="POST" class="card space-y-4">
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<div>
			<label class="label" for="email">Email</label>
			<input class="input" id="email" name="email" type="email" required value={form?.email ?? ''} autocomplete="email" />
		</div>
		<div>
			<label class="label" for="password">Password</label>
			<input class="input" id="password" name="password" type="password" required autocomplete="current-password" />
		</div>
		<button class="btn w-full">Log in</button>
	</form>
	<p class="mt-4 text-center text-sm text-zinc-600">
		New here?
		<a class="font-semibold text-hot underline underline-offset-4" href={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}>Create an account</a>
	</p>
</div>
