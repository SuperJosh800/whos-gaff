<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const t = $derived(data.themes);
	const most = $derived(Math.max(1, ...t.options.map((o) => o.votes)));
	let error = $state('');
	// Shows a failed suggestion or vote here in the card, not at the top of the page.
	const submit: SubmitFunction = () => async ({ update, result }) => {
		if (result.type === 'failure') {
			error = String(result.data?.error ?? 'Something went wrong.');
			return;
		}
		error = '';
		await update();
	};
</script>

<section class="card space-y-4" id="dress-code">
	<h2>Dress code</h2>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if t.theme}
		<div class="border border-lime px-3 py-3">
			<p class="text-[11px] font-extrabold tracking-widest text-lime uppercase">Locked in</p>
			<p class="text-2xl leading-tight font-black break-words">{t.theme}</p>
		</div>
		{#if data.isHost}
			<form method="POST" action="?/lockTheme" use:enhance={submit}>
				<input type="hidden" name="label" value="" />
				<button class="text-sm font-semibold text-zinc-500 underline underline-offset-4">Reopen the vote</button>
			</form>
		{/if}
	{:else}
		{#if t.options.length}
			<ul class="divide-y divide-zinc-200 border border-zinc-200">
				{#each t.options as o (o.id)}
					<li>
						<form method="POST" action="?/voteTheme" use:enhance={submit}>
							<input type="hidden" name="option" value={o.mine ? '' : o.id} />
							<button class="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 text-left {o.mine ? 'bg-lime text-ink' : 'hover:bg-zinc-100'}" aria-pressed={o.mine}>
								<span class="min-w-0">
									<span class="block font-extrabold break-words">{o.label}</span>
									<span class="block h-1.5 {o.mine ? 'bg-ink/15' : 'bg-zinc-100'}"><span class="block h-full {o.mine ? 'bg-ink' : 'bg-lime'}" style="width: {(o.votes / most) * 100}%"></span></span>
									{#if o.voters}<span class="mt-1 block text-xs {o.mine ? 'text-ink/70' : 'text-zinc-500'}">{o.voters}</span>{/if}
								</span>
								<span class="text-xl font-black tabular-nums">{o.votes}</span>
							</button>
						</form>
						{#if data.isHost || o.canRemove}
							<div class="flex gap-4 border-t border-zinc-200 px-3 py-1.5 text-[11px] font-extrabold tracking-widest [&_button]:uppercase">
								{#if data.isHost}
									<form method="POST" action="?/lockTheme" use:enhance={submit}>
										<input type="hidden" name="label" value={o.label} />
										<button class="text-hot">Lock it in</button>
									</form>
								{/if}
								{#if o.canRemove}
									<form method="POST" action="?/removeTheme" use:enhance={submit}>
										<input type="hidden" name="option" value={o.id} />
										<button class="text-zinc-500">Remove</button>
									</form>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
			<p class="text-xs text-zinc-500">Tap one to vote. One vote each; tap yours again to take it back.</p>
		{:else}
			<p class="text-sm text-zinc-500">No ideas yet. Black tie, double denim, anything but clothes?</p>
		{/if}
		<form method="POST" action="?/suggestTheme" use:enhance={submit} class="joined">
			<input class="input" name="label" maxlength="60" required placeholder="Suggest a dress code or theme" aria-label="Dress code or theme" />
			<button class="btn-secondary">Add</button>
		</form>
	{/if}
</section>
