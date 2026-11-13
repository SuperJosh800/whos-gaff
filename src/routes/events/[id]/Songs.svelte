<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	/** Shown straight away; the rest fold away so a long list doesn't swamp the page. */
	const TOP = 10;
	const songs = $derived(data.songs);
	const most = $derived(Math.max(1, ...songs.map((s) => s.votes)));
	let error = $state('');
	// Shows a failed request or tick here in the card. Only adding a song clears its form.
	const submit =
		(reset = false): SubmitFunction =>
		() =>
		async ({ update, result }) => {
			if (result.type === 'failure') {
				error = String(result.data?.error ?? 'Something went wrong.');
				return;
			}
			error = '';
			await update({ reset });
		};
</script>

{#snippet row(s: PageData['songs'][number], rank: number)}
	<li>
		<form method="POST" action="?/voteSong" use:enhance={submit()}>
			<input type="hidden" name="song" value={s.id} />
			<input type="hidden" name="up" value={s.mine ? '0' : '1'} />
			<button class="grid w-full grid-cols-[1.5rem_1fr_auto] items-center gap-3 px-3 py-2.5 text-left {s.mine ? 'bg-lime text-ink' : 'hover:bg-zinc-100'}" aria-pressed={s.mine}>
				<span class="text-xs font-black tabular-nums {s.mine ? 'text-ink/60' : 'text-zinc-500'}">{rank}</span>
				<span class="min-w-0">
					<span class="block font-extrabold break-words">{s.title}{#if s.added}<span class="badge ml-2 align-middle {s.mine ? 'text-ink/70' : 'text-lime'}">In the playlist</span>{/if}</span>
					{#if s.artist}<span class="block text-sm break-words {s.mine ? 'text-ink/70' : 'text-zinc-600'}">{s.artist}</span>{/if}
					<span class="mt-1 block h-1.5 {s.mine ? 'bg-ink/15' : 'bg-zinc-100'}"><span class="block h-full {s.mine ? 'bg-ink' : 'bg-lime'}" style="width: {(s.votes / most) * 100}%"></span></span>
					{#if s.voters}<span class="mt-1 block text-xs {s.mine ? 'text-ink/70' : 'text-zinc-500'}">{s.voters}</span>{/if}
				</span>
				<span class="text-xl font-black tabular-nums">{s.votes}<span class="sr-only"> {s.votes === 1 ? 'person wants' : 'people want'} it</span></span>
			</button>
		</form>
		<div class="flex flex-wrap items-center border-t border-zinc-200 text-[11px] font-extrabold tracking-widest uppercase [&_button]:px-3 [&_button]:py-2.5 [&_button]:uppercase">
			<a class="px-3 py-2.5 text-zinc-900 underline underline-offset-4" href={s.spotify} target="_blank" rel="noopener noreferrer" aria-label="Find {s.title} on Spotify">Find on Spotify</a>
			{#if data.isHost}
				<form method="POST" action="?/songAdded" use:enhance={submit()}>
					<input type="hidden" name="song" value={s.id} />
					<input type="hidden" name="added" value={s.added ? '0' : '1'} />
					<button class={s.added ? 'text-zinc-500' : 'text-hot'} aria-label={s.added ? `Unmark ${s.title} as in the playlist` : `Mark ${s.title} as added to the playlist`}>{s.added ? 'Unmark' : 'Mark added'}</button>
				</form>
			{/if}
			{#if s.canRemove}
				<form method="POST" action="?/removeSong" use:enhance={submit()}>
					<input type="hidden" name="song" value={s.id} />
					<button class="text-zinc-500" aria-label="Remove {s.title}">Remove</button>
				</form>
			{/if}
		</div>
	</li>
{/snippet}

<section class="card space-y-4" id="songs">
	<h2>Song requests</h2>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if songs.length}
		<ol class="divide-y divide-zinc-200 border border-zinc-200">
			{#each songs.slice(0, TOP) as s, i (s.id)}{@render row(s, i + 1)}{/each}
		</ol>
		{#if songs.length > TOP}
			<details>
				<summary class="cursor-pointer text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase">{songs.length - TOP} more</summary>
				<ol class="mt-2 divide-y divide-zinc-200 border border-zinc-200" start={TOP + 1}>
					{#each songs.slice(TOP) as s, i (s.id)}{@render row(s, TOP + i + 1)}{/each}
				</ol>
			</details>
		{/if}
	{/if}
	<p class="text-xs text-zinc-500">
		{#if data.isHost}
			{data.event.playlist_url
				? 'Add the top songs to the playlist, then mark them here.'
				: 'Add a Spotify playlist link in your settings below, then put the top songs in it.'}
		{:else}
			{songs.length ? 'Tick every song you want, and the most wanted rise to the top.' : 'Add the songs you want played.'}
			{data.event.playlist_url ? 'The host puts the top ones in the playlist.' : ''}
		{/if}
	</p>
	<form method="POST" action="?/requestSong" use:enhance={submit(true)} class="grid border border-zinc-200 sm:grid-cols-[2fr_1fr_auto] [&>*]:border-0 [&>*+*]:border-t [&>*+*]:border-zinc-200 sm:[&>*+*]:border-t-0 sm:[&>*+*]:border-l">
		<input class="input" name="title" maxlength="60" required placeholder="Song" aria-label="Song" />
		<input class="input" name="artist" maxlength="60" placeholder="Artist (optional)" aria-label="Artist (optional)" />
		<button class="btn-secondary">Add</button>
	</form>
</section>
