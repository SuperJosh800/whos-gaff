<script lang="ts">
	let { entries }: { entries: { event_id: number; title: string; label: string }[] } = $props();
</script>

<section class="card space-y-2">
	<h2 class="text-lg font-bold">Hall of fame 🏆</h2>
	{#if entries.length}
		<ul class="space-y-1">
			{#each entries as e (`${e.event_id}-${e.label}`)}
				<li><strong>{e.label}</strong> <span class="text-zinc-500">at {e.title}</span></li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-zinc-500">No awards yet.</p>
	{/if}
</section>
