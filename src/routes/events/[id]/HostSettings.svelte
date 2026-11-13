<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data, saved }: { data: PageData; saved: boolean } = $props();
</script>

<section class="card space-y-4">
	<h2>Host settings</h2>
	<form method="POST" action="?/settings" use:enhance={() => async ({ update }) => update({ reset: false })} class="space-y-4">
		<div>
			<label class="label" for="gaff">Gaff profile</label>
			<select class="input" id="gaff" name="gaff" value={data.event.gaff_id ?? ''}>
				<option value="">None</option>
				{#each data.myGaffs as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
			</select>
			<p class="mt-1 text-xs text-zinc-500">
				Shares the address, house rules and Wi-Fi with people who are going.
				<a class="font-semibold text-hot underline underline-offset-4" href="/gaffs">Manage gaff profiles</a>
			</p>
		</div>
		{#if data.event.starts_at}
			<div>
				<label class="label" for="repeat">Repeats</label>
				<select class="input" id="repeat" name="repeat" value={String(data.event.repeat_days ?? '')}>
					<option value="">Doesn’t repeat</option>
					<option value="7">Every week</option>
					<option value="14">Every fortnight</option>
				</select>
				<p class="mt-1 text-xs text-zinc-500">When this night starts, the next one is set up for the same time with the same people, and they’re asked if they’re coming.</p>
			</div>
		{/if}
		<div>
			<label class="label" for="playlist_url">Spotify playlist link</label>
			<input class="input" id="playlist_url" name="playlist_url" type="url" placeholder="https://open.spotify.com/playlist/…" value={data.event.playlist_url} />
		</div>
		<div class="flex items-center gap-3">
			<button class="btn">Save</button>
			{#if saved}<span class="text-sm text-emerald-700">Saved.</span>{/if}
		</div>
	</form>
</section>
