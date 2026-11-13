<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const me = $derived(page.data.user?.id);
	const q = $derived(data.quiz);
	const result = $derived(form && 'result' in form ? form.result : null);
	const others = $derived(data.members.filter((m) => m.id !== me));
	const got = (r: { answered: number; correct: number }) => (r.answered ? `${r.correct} of ${r.answered} got it` : 'Nobody’s answered yet');
</script>

<svelte:head><title>Quiz · {data.group.name} · Who's Gaff</title></svelte:head>

<div class="space-y-6">
	<div class="space-y-1">
		<a class="text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase hover:text-zinc-900" href="/groups/{data.group.id}">{data.group.name}</a>
		<h1 class="text-4xl sm:text-5xl">How well do you know each other?</h1>
	</div>
	{#if form && 'error' in form}<p class="error" role="alert">{form.error}</p>{/if}

	<section class="card space-y-3" id="play">
		<div class="flex items-baseline justify-between gap-3">
			<h2>Your turn</h2>
			{#if q.left}<span class="text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase">{q.left} to answer</span>{/if}
		</div>
		{#if result}
			<p class="border px-3 py-2.5 text-sm {result.correct ? 'border-lime' : 'border-hot'}" role="status">
				<span class="font-extrabold uppercase {result.correct ? 'text-lime' : 'text-hot'}">{result.correct ? 'Right' : 'Wrong'}.</span>
				{result.question} <strong>{result.answer}</strong>
			</p>
		{/if}
		{#if q.next}
			<div class="border border-zinc-200">
				<p class="px-3 py-3"><span class="block text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase">About {q.next.about} · from {q.next.author}</span>
					<span class="text-xl leading-tight font-black">{q.next.question}</span></p>
				<form method="POST" action="?/answer" use:enhance class="divide-y divide-zinc-200 border-t border-zinc-200">
					{#each q.next.options as o (o)}
						<button class="block w-full px-3 py-3 text-left text-sm font-extrabold hover:bg-lime hover:text-ink focus-visible:bg-lime focus-visible:text-ink" name="choice" value={o}>{o}</button>
					{/each}
					<input type="hidden" name="id" value={q.next.id} />
					<input type="hidden" name="question" value={q.next.question} />
				</form>
			</div>
		{:else}
			<p class="text-sm text-zinc-500">{q.scores.some((s) => s.id === me) ? 'You’re all caught up. Write one for everyone else below.' : 'No questions for you yet. Write the first one below.'}</p>
		{/if}
	</section>

	{#if q.scores.length}
		<section class="card space-y-3">
			<h2>Knows the group best</h2>
			<table class="w-full text-sm">
				<tbody>
					{#each q.scores as s (s.id)}
						{@const top = s.place === 1 && s.correct > 0}
						<tr class="border-t border-zinc-200 first:border-t-0 {top ? 'bg-lime text-ink' : ''}">
							<td class="w-8 px-1 py-2.5 font-black tabular-nums {top ? '' : 'text-zinc-500'}">{s.place}</td>
							<td class="py-2.5 pr-2 font-extrabold break-all {s.id === me && !top ? 'text-lime' : ''}">{s.id === me ? 'You' : s.name}</td>
							<td class="py-2.5 pr-1 pl-2 text-right whitespace-nowrap tabular-nums"><span class="text-lg font-black">{s.correct}</span><span class="text-xs">/{s.answered}</span></td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="text-xs text-zinc-500">Right answers out of questions answered.</p>
		</section>
	{/if}

	<section class="card space-y-3" id="write">
		<h2>Write a question</h2>
		<form method="POST" action="?/add" use:enhance class="space-y-3">
			<label class="block"><span class="label">About</span>
				<select class="input" name="about" required>
					{#each others as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
					<option value={me}>Me</option>
				</select></label>
			<label class="block"><span class="label">Question</span>
				<input class="input" name="question" maxlength="140" required placeholder="What’s their go-to drink?" /></label>
			<label class="block"><span class="label">Right answer</span>
				<input class="input border-lime" name="answer" maxlength="60" required placeholder="Tennent’s" /></label>
			<fieldset class="space-y-0">
				<legend class="label">Wrong answers (one to three)</legend>
				<input class="input" name="wrong" maxlength="60" required placeholder="Guinness" aria-label="Wrong answer 1" />
				<input class="input border-t-0" name="wrong" maxlength="60" placeholder="Vodka coke" aria-label="Wrong answer 2 (optional)" />
				<input class="input border-t-0" name="wrong" maxlength="60" placeholder="Optional" aria-label="Wrong answer 3 (optional)" />
			</fieldset>
			<button class="btn">Add question</button>
		</form>
	</section>

	{#if q.aboutMe.length}
		<section class="card space-y-3">
			<h2>How well they know you</h2>
			<ul class="divide-y divide-zinc-200 border border-zinc-200 text-sm">
				{#each q.aboutMe as a (a.id)}
					<li class="grid grid-cols-[1fr_auto] items-center">
						<p class="min-w-0 px-3 py-2.5 break-words">{a.question} <strong>{a.answer}</strong>
							<span class="block text-xs text-zinc-500">From {a.author} · {got(a)}</span></p>
						<form method="POST" action="?/delete" use:enhance class="self-stretch" onsubmit={(e) => { if (!confirm('Delete this question about you?')) e.preventDefault(); }}>
							<input type="hidden" name="id" value={a.id} />
							<button class="h-full border-l border-zinc-200 px-3 text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase hover:bg-zinc-100 hover:text-zinc-900">Delete</button>
						</form>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if q.mine.length}
		<section class="card space-y-3">
			<h2>Your questions</h2>
			<ul class="divide-y divide-zinc-200 border border-zinc-200 text-sm">
				{#each q.mine as a (a.id)}
					<li class="grid grid-cols-[1fr_auto] items-center">
						<p class="min-w-0 px-3 py-2.5 break-words">{a.question} <strong>{a.answer}</strong>
							<span class="block text-xs text-zinc-500">About {a.about} · {got(a)}</span></p>
						<form method="POST" action="?/delete" use:enhance class="self-stretch" onsubmit={(e) => { if (!confirm('Delete this question?')) e.preventDefault(); }}>
							<input type="hidden" name="id" value={a.id} />
							<button class="h-full border-l border-zinc-200 px-3 text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase hover:bg-zinc-100 hover:text-zinc-900">Delete</button>
						</form>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
