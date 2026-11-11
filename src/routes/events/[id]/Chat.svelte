<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let list: HTMLUListElement | undefined = $state();

	// Keep the newest message in view.
	$effect(() => {
		if (data.messages.length && list) list.scrollTop = list.scrollHeight;
	});

	const time = (utc: string) =>
		new Date(utc.replace(' ', 'T') + 'Z').toLocaleString('en-GB', {
			weekday: 'short',
			hour: 'numeric',
			minute: '2-digit'
		});
</script>

<section id="chat" class="card space-y-3">
	<h2 class="text-lg font-bold">Group chat</h2>
	{#if data.messages.length}
		<ul bind:this={list} class="max-h-80 space-y-2 overflow-y-auto">
			{#each data.messages as m (m.id)}
				{@const mine = m.user_id === page.data.user?.id}
				<li class="flex {mine ? 'justify-end' : ''}">
					<div class="max-w-[80%] rounded-2xl px-3 py-2 text-sm {mine ? 'bg-lime text-ink' : 'bg-zinc-100'}">
						{#if !mine}<p class="text-xs font-semibold text-zinc-600">{m.name}</p>{/if}
						<p class="whitespace-pre-line break-words">{m.body}</p>
						<p class="mt-0.5 text-[10px] {mine ? 'text-ink/60' : 'text-zinc-500'}">{time(m.created_at)}</p>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-zinc-500">No messages yet. Say hi to everyone who's invited.</p>
	{/if}
	<form method="POST" action="?/message" use:enhance class="flex gap-2">
		<textarea name="body" rows="1" maxlength="1000" required class="input resize-none"
			placeholder="Message everyone invited" aria-label="Message"
			onkeydown={(e) => {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					e.currentTarget.form?.requestSubmit();
				}
			}}></textarea>
		<button class="btn shrink-0">Send</button>
	</form>
</section>
