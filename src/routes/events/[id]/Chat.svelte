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
	<h2>Group chat</h2>
	{#if data.messages.length}
		<ul bind:this={list} class="max-h-80 divide-y divide-zinc-200 overflow-y-auto border border-zinc-200">
			{#each data.messages as m (m.id)}
				{@const mine = m.user_id === page.data.user?.id}
				<li class="grid grid-cols-[4.5rem_1fr] text-sm">
					<span class="border-r border-zinc-200 px-2 py-2 text-[11px] text-zinc-500 tabular-nums">{time(m.created_at)}</span>
					<p class="min-w-0 px-3 py-2 break-words whitespace-pre-line">
						<span class="font-extrabold {mine ? 'text-lime' : 'text-zinc-900'}">{mine ? 'You' : m.name}</span>
						<span class="text-zinc-700">{m.body}</span>
					</p>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-zinc-500">No messages yet. Say hi to everyone who's invited.</p>
	{/if}
	<form method="POST" action="?/message" use:enhance class="joined">
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
