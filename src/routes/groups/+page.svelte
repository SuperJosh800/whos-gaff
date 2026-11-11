<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<div class="space-y-5">
	<div>
		<h1 class="text-2xl font-bold">Your groups</h1>
		<p class="text-zinc-600">Your regular crews. Invite them to events in one go, shout about free gaffs, and see who’s out.</p>
	</div>
	{#if data.groups.length}
		<div class="grid gap-3 sm:grid-cols-2">
			{#each data.groups as g (g.id)}
				<a href="/groups/{g.id}" class="card block transition hover:border-brand-500">
					<p class="text-lg font-bold">{g.name}</p>
					<p class="text-sm text-zinc-600">{g.members} member{g.members === 1 ? '' : 's'}</p>
				</a>
			{/each}
		</div>
	{/if}
	<form method="POST" class="card space-y-3">
		<h2 class="text-lg font-bold">New group</h2>
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<div class="flex gap-2">
			<input class="input" name="name" placeholder="The lads, Flat 2/1, Uni pals…" required maxlength="60" aria-label="Group name" />
			<button class="btn shrink-0">Create group</button>
		</div>
	</form>
</div>
