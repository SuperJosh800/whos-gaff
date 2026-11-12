<script lang="ts">
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	const next = page.url.searchParams.get('next');
</script>

<div class="mx-auto max-w-sm">
	<h1 class="mb-4 text-2xl font-bold">Create an account</h1>
	<form method="POST" class="card space-y-4">
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<div>
			<label class="label" for="name">Name</label>
			<input class="input" id="name" name="name" required value={form?.name ?? ''} autocomplete="name" />
		</div>
		<div>
			<label class="label" for="email">Email</label>
			<input class="input" id="email" name="email" type="email" required value={form?.email ?? ''} autocomplete="email" />
		</div>
		<div>
			<label class="label" for="password">Password</label>
			<input class="input" id="password" name="password" type="password" required minlength="8" autocomplete="new-password" />
		</div>
		<button class="btn w-full">Sign up</button>
	</form>
	<p class="mt-4 text-center text-sm text-zinc-600">
		Already have an account?
		<a class="font-semibold text-hot underline underline-offset-4" href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}>Log in</a>
	</p>
</div>
