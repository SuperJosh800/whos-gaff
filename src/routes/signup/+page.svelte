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
			<input class="input" id="password" name="password" type="password" required minlength="8" maxlength="200" autocomplete="new-password" />
			<p class="mt-1 text-xs text-zinc-500">At least 8 characters. A short phrase is easier to remember and harder to guess.</p>
		</div>
		<label class="flex items-start gap-2 text-sm text-zinc-700">
			<input type="checkbox" name="agree" required class="mt-1" />
			<span>I’m 18 or over and I agree to the <a class="font-semibold text-brand-700 underline" href="/terms" target="_blank">terms</a> and <a class="font-semibold text-brand-700 underline" href="/privacy" target="_blank">privacy policy</a>.</span>
		</label>
		<button class="btn w-full">Sign up</button>
	</form>
	<p class="mt-4 text-center text-sm text-zinc-600">
		Already have an account?
		<a class="font-semibold text-brand-700" href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}>Log in</a>
	</p>
</div>
