<script lang="ts">
	let { entries }: { entries: { event_id: number; title: string; label: string }[] } = $props();
</script>

<section class="card space-y-2">
	<h2>Hall of fame</h2>
	{#if entries.length}
		<ul class="divide-y divide-zinc-200 border border-zinc-200 text-sm">
			{#each entries as e (`${e.event_id}-${e.label}`)}
				<li class="px-3 py-2.5"><span class="font-extrabold uppercase">{e.label}</span> <span class="text-zinc-500">at {e.title}</span></li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-zinc-500">No awards yet.</p>
	{/if}
</section>
