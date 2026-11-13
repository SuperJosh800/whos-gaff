<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { page } from '$app/state';
	import { formatShortDay } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const me = $derived(page.data.user?.id);
	const others = $derived(data.members.filter((m) => m.id !== me));
	let addError = $state('');
	// Shows a problem with a new quote by the form rather than at the top of the page.
	const adding: SubmitFunction = () => async ({ update, result }) => {
		addError = result.type === 'failure' ? String(result.data?.error ?? 'Something went wrong.') : '';
		if (result.type !== 'failure') await update();
	};
	// enhance sends the form even when a submit handler prevents it, so the confirm cancels it here.
	const confirmRemove: SubmitFunction = ({ cancel }) => {
		if (!confirm('Take this quote off the wall?')) cancel();
	};
</script>

<svelte:head><title>Quotes · {data.group.name} · Who's Gaff</title></svelte:head>

<div class="space-y-6">
	<div class="space-y-1">
		<a class="text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase hover:text-zinc-900" href="/groups/{data.group.id}">{data.group.name}</a>
		<h1 class="text-4xl sm:text-5xl">Quotes wall</h1>
	</div>
	{#if form && 'error' in form}<p class="error" role="alert">{form.error}</p>{/if}

	<section class="card space-y-3" id="add">
		<h2>Who said what?</h2>
		{#if addError}<p class="error" role="alert">{addError}</p>{/if}
		<form method="POST" action="?/add" use:enhance={adding} class="space-y-3">
			<label class="block"><span class="label">Quote</span>
				<textarea class="input" name="text" maxlength="200" rows="2" required placeholder="I’m only staying for one."></textarea></label>
			<div class="grid grid-cols-2 gap-3">
				<label class="block min-w-0"><span class="label">Said by</span>
					<select class="input" name="said_by" required>
						{#each others as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
						<option value={me}>Me</option>
					</select></label>
				<label class="block min-w-0"><span class="label">Night (optional)</span>
					<select class="input" name="night">
						<option value="">None</option>
						{#each data.nights as n (n.id)}<option value={n.id}>{n.title} · {formatShortDay(n.starts_at)}</option>{/each}
					</select></label>
			</div>
			<button class="btn">Put it on the wall</button>
		</form>
	</section>

	<section class="space-y-3" aria-label="Quotes">
		<nav class="strip" aria-label="Sort quotes">
			<a href="?sort=top" aria-current={data.sort === 'top' ? 'page' : undefined}>Top</a>
			<a href="?sort=new" aria-current={data.sort === 'new' ? 'page' : undefined}>New</a>
		</nav>
		{#if data.quotes.length}
			<ul class="divide-y divide-zinc-200 border border-zinc-200">
				{#each data.quotes as q (q.id)}
					<li class="grid grid-cols-[1fr_auto]">
						<div class="min-w-0 px-3 py-3">
							<figure>
							<blockquote class="text-lg leading-snug font-black break-words">“{q.text}”</blockquote>
							<figcaption class="mt-1 text-xs text-zinc-500">
								<span class="font-extrabold text-hot uppercase">{q.said_by === me ? 'You' : q.said_by_name}</span>{q.night ? ` · ${q.night}, ${formatShortDay(q.starts_at!)}` : ''} · posted by {q.poster_id === me ? 'you' : q.poster}
							</figcaption>
							</figure>
							{#if q.canRemove}
								<form method="POST" action="?/remove" use:enhance={confirmRemove} class="mt-2">
									<input type="hidden" name="id" value={q.id} />
									<button class="text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase hover:text-zinc-900" aria-label="Take down: {q.text}">Take down</button>
								</form>
							{/if}
						</div>
						{#if q.canVote}
							<form method="POST" action="?/vote" use:enhance class="self-stretch border-l border-zinc-200">
								<input type="hidden" name="id" value={q.id} />
								<input type="hidden" name="on" value={q.voted ? '0' : '1'} />
								<button class="flex h-full w-16 flex-col items-center justify-center {q.voted ? 'bg-lime text-ink' : 'hover:bg-zinc-100'}" aria-pressed={q.voted} aria-label="Vote for “{q.text}”, {q.votes} {q.votes === 1 ? 'vote' : 'votes'}">
									<span class="text-xl leading-none font-black tabular-nums">{q.votes}</span>
									<span class="text-[10px] font-extrabold tracking-widest uppercase">{q.voted ? 'Voted' : 'Vote'}</span>
								</button>
							</form>
						{:else}
							<span class="flex w-16 flex-col items-center justify-center border-l border-zinc-200 text-zinc-500">
								<span class="text-xl leading-none font-black tabular-nums">{q.votes}</span>
								<span class="text-[10px] font-extrabold tracking-widest uppercase">{q.votes === 1 ? 'Vote' : 'Votes'}</span>
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="card text-sm text-zinc-500">Nothing on the wall yet. Put up the first one.</p>
		{/if}
	</section>
</div>
