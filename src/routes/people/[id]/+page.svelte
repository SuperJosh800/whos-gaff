<script lang="ts">
	import HallOfFame from './HallOfFame.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<div class="mx-auto max-w-lg space-y-4">
	<h1 class="text-2xl font-bold">{data.name}</h1>
	<HallOfFame entries={data.hallOfFame} />
</div>
