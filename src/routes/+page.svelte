<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

{#if data.user}
	<h1 class="text-2xl font-bold">Hi {data.user.name} 👋</h1>
	<p class="mt-2 text-zinc-600">
		<a class="font-semibold text-brand-700" href="/events/new">Start planning something</a>.
	</p>
{:else}
	<section class="py-16 text-center">
		<h1 class="text-4xl font-extrabold tracking-tight sm:text-5xl">Who's coming to the gaff?</h1>
		<p class="mx-auto mt-4 max-w-xl text-lg text-zinc-600">
			Pick a date everyone can do, get RSVPs, and see who's actually turning up, without scrolling
			back through the group chat.
		</p>
		<div class="mt-8 flex justify-center gap-3">
			<a href="/signup" class="btn">Get started</a>
			<a href="/login" class="btn-secondary">Log in</a>
		</div>
	</section>
{/if}
