<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatTime, formatWhen } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const going = $derived(data.people);
	let shared = $state('');

	const summary = $derived(
		[
			`🎉 ${data.event.title}${data.event.starts_at ? ` · ${formatWhen(data.event.starts_at)}` : ''}`,
			`👥 ${going.map((p) => p.name).join(', ')}`,
			...data.awards.filter((a) => a.winners.length).map((a) => `${a.label}: ${a.winners.map((w) => w.name).join(' & ')}`),
			data.stages.length ? `🗺️ ${data.stages.map((s) => `${s.name} ${formatTime(s.starts_at)}`).join(' → ')}` : ''
		]
			.filter(Boolean)
			.join('\n')
	);

	// Shares through the phone's share sheet (WhatsApp, Discord…) where available, else copies the recap.
	async function share() {
		const url = `${location.origin}/events/${data.event.id}/after`;
		if (navigator.share) {
			try {
				await navigator.share({ title: `${data.event.title} recap`, text: summary, url });
				return;
			} catch {
				/* cancelled: fall back to copying */
			}
		}
		await navigator.clipboard.writeText(`${summary}\n${url}`);
		shared = 'Copied the recap. Paste it in the group chat!';
	}
</script>

{#if form?.error}<p class="error mb-5" role="alert">{form.error}</p>{/if}

{#if !data.over}
	<p class="card text-zinc-600">Awards and the night recap open once the night starts.</p>
{:else}
	<div class="space-y-5">
		<section class="overflow-hidden border-2 border-hot bg-surface p-6 text-zinc-900 shadow-[6px_6px_0_var(--color-lime)]" aria-label="Night recap card">
			<p class="text-sm font-semibold tracking-wide text-hot uppercase">Night recap</p>
			<h2 class="text-4xl font-black">{data.event.title}</h2>
			{#if data.event.starts_at}<p class="text-hot">{formatWhen(data.event.starts_at)}</p>{/if}

			{#if data.photos.length}
				<div class="mt-4 grid grid-cols-3 gap-2">
					{#each data.photos.slice(0, 6) as p (p.id)}
						<img src="/events/{data.event.id}/photos/{p.id}" alt="Photo from {p.name}" class="aspect-square w-full rounded-xl object-cover" />
					{/each}
				</div>
			{/if}

			<div class="mt-4 grid gap-4 sm:grid-cols-3">
				<div>
					<p class="text-xs font-bold text-hot uppercase">Who came</p>
					<p>{going.map((p) => p.name).join(', ')}</p>
				</div>
				<div>
					<p class="text-xs font-bold text-hot uppercase">Awards</p>
					{#each data.awards as a (a.key)}
						<p>{a.label}: <strong>{a.winners.length ? a.winners.map((w) => w.name).join(' & ') : '–'}</strong></p>
					{/each}
				</div>
				{#if data.stages.length}
					<div>
						<p class="text-xs font-bold text-hot uppercase">The night</p>
						{#each data.stages as s (s.id)}<p>{formatTime(s.starts_at)} · {s.name}</p>{/each}
					</div>
				{/if}
			</div>
			<div class="mt-5 flex flex-wrap items-center gap-3">
				<button type="button" class="btn" onclick={share}>Share to the group chat</button>
				{#if shared}<span class="text-sm">{shared}</span>{/if}
			</div>
		</section>

		<section class="card space-y-3">
			<h2 class="text-lg font-bold">Vote for the awards 🏆</h2>
			<div class="grid gap-3 sm:grid-cols-3">
				{#each data.awards as a (a.key)}
					<form method="POST" action="?/vote" use:enhance={() => async ({ update }) => update({ reset: false })} class="rounded-xl border border-zinc-200 p-3">
						<input type="hidden" name="award" value={a.key} />
						<label class="label" for="award-{a.key}">{a.label}</label>
						<div class="flex gap-2">
							<select class="input" id="award-{a.key}" name="nominee" required value={a.myVote ?? ''}>
								<option value="" disabled>Pick someone</option>
								{#each data.people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
							</select>
							<button class="btn-secondary btn-small">{a.myVote ? 'Change' : 'Vote'}</button>
						</div>
					</form>
				{/each}
			</div>
		</section>

		<section class="card space-y-3">
			<h2 class="text-lg font-bold">Photos 📸</h2>
			<form method="POST" action="?/photo" enctype="multipart/form-data" use:enhance class="flex flex-wrap items-center gap-2">
				<input class="text-sm" type="file" name="photo" accept="image/jpeg,image/png,image/gif,image/webp" required aria-label="Photo" />
				<button class="btn-secondary">Upload</button>
			</form>
			{#if data.photos.length > 6}<p class="text-sm text-zinc-500">The recap shows the first 6 of {data.photos.length} photos.</p>{/if}
		</section>
	</div>
{/if}
