<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Gaff } from '#lib/server/gaff.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const fields = [
		{ name: 'address', label: 'Address', placeholder: '12 Byres Road, Glasgow G11', rows: 2 },
		{ name: 'house_rules', label: 'House rules', placeholder: 'Shoes off, no smoking inside', rows: 2 },
		{ name: 'wifi', label: 'Wi-Fi', placeholder: 'Network / password', rows: 1 },
		{ name: 'coats', label: 'Where to put coats', placeholder: 'Back bedroom', rows: 1 },
		{ name: 'parking', label: 'Parking', placeholder: 'Free on the street after 6pm', rows: 1 },
		{ name: 'notes', label: 'Notes', placeholder: 'Neighbours are moany after 11', rows: 2 }
	] as const;
</script>

{#snippet gaffForm(gaff?: Gaff)}
	<form method="POST" action="?/save" use:enhance={() => async ({ update }) => update({ reset: !gaff })} class="space-y-3">
		{#if gaff}<input type="hidden" name="id" value={gaff.id} />{/if}
		<div>
			<label class="label" for="name-{gaff?.id ?? 'new'}">Name</label>
			<input class="input" id="name-{gaff?.id ?? 'new'}" name="name" required placeholder="Josh’s flat" value={gaff?.name ?? ''} />
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			{#each fields as f (f.name)}
				<div>
					<label class="label" for="{f.name}-{gaff?.id ?? 'new'}">{f.label}</label>
					<textarea class="input" id="{f.name}-{gaff?.id ?? 'new'}" name={f.name} rows={f.rows} placeholder={f.placeholder}>{gaff?.[f.name] ?? ''}</textarea>
				</div>
			{/each}
		</div>
		<div class="flex gap-2">
			<button class="btn">{gaff ? 'Save changes' : 'Save gaff profile'}</button>
			{#if gaff}
				<button class="btn-secondary text-red-700" formaction="?/delete" formnovalidate>Delete</button>
			{/if}
		</div>
	</form>
{/snippet}

<div class="space-y-5">
	<div>
		<h1 class="text-2xl font-bold">Gaff profiles</h1>
		<p class="text-zinc-600">Save your place once, then attach it to any event you host there. Only people going see it.</p>
	</div>
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

	{#each data.gaffs as gaff (gaff.id)}
		<details class="card">
			<summary class="cursor-pointer text-lg font-bold">{gaff.name} <span class="text-sm font-normal text-zinc-500">{gaff.address}</span></summary>
			<div class="mt-4">{@render gaffForm(gaff)}</div>
		</details>
	{/each}

	<section class="card">
		<h2 class="mb-3 text-lg font-bold">New gaff profile</h2>
		{@render gaffForm()}
	</section>
</div>
