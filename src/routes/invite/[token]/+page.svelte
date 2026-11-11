<script lang="ts">
	import { page } from '$app/state';
	import { formatWhen } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const next = encodeURIComponent(page.url.pathname);
</script>

<div class="card mx-auto max-w-md space-y-4 text-center">
	<p class="text-sm font-semibold text-brand-700">{data.preview.host_name} invited you to</p>
	<h1 class="text-3xl font-extrabold tracking-tight">{data.preview.title}</h1>
	<p class="text-zinc-600">
		{data.preview.starts_at ? formatWhen(data.preview.starts_at) : 'Date still being voted on'}
	</p>
	<p class="text-sm text-zinc-600">Sign up or log in to vote and RSVP.</p>
	<div class="flex justify-center gap-3">
		<a class="btn" href="/signup?next={next}">Sign up</a>
		<a class="btn-secondary" href="/login?next={next}">Log in</a>
	</div>
</div>
