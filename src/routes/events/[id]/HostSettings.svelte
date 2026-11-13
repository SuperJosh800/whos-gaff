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
		<div>
			<label class="label" for="guest_limit">Guest limit</label>
			<input class="input max-w-32" id="guest_limit" name="guest_limit" type="number" min="2" max="500" inputmode="numeric" placeholder="No limit" value={data.event.guest_limit ?? ''} />
			<p class="mt-1 text-xs text-zinc-500">The most people going, counting you. Once it’s full, anyone else who says they’re going joins a waitlist and gets the next spot that opens up.</p>
		</div>
		{#if data.repeatedInto}
			<div>
				<span class="label">Repeats</span>
				<p class="text-sm text-zinc-600">This night has been repeated. <a class="font-semibold text-hot underline underline-offset-4" href="/events/{data.repeatedInto}">Go to the next one</a> to change or stop the repeat.</p>
			</div>
		{:else if data.event.starts_at}
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
