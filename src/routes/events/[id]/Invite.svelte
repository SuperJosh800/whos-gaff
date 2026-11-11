<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data, invited }: { data: PageData; invited?: number } = $props();
	let copied = $state(false);

	async function copy() {
		await navigator.clipboard.writeText(data.inviteLink!);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<section class="card space-y-4">
	<h2 class="text-lg font-bold">Invite people</h2>
	<div>
		<label class="label" for="invite-link">Shareable invite link</label>
		<div class="flex gap-2">
			<input class="input bg-zinc-50" id="invite-link" readonly value={data.inviteLink} onfocus={(e) => e.currentTarget.select()} />
			<button type="button" class="btn-secondary shrink-0" onclick={copy}>{copied ? 'Copied!' : 'Copy link'}</button>
		</div>
	</div>
	<form method="POST" action="?/invite" use:enhance>
		<label class="label" for="emails">Invite by email</label>
		<div class="flex gap-2">
			<input class="input" id="emails" name="emails" placeholder="sam@example.com, alex@example.com" required />
			<button class="btn shrink-0">Send invites</button>
		</div>
		{#if invited}<p class="mt-2 text-sm text-emerald-700">Sent {invited} invite{invited === 1 ? '' : 's'}.</p>{/if}
	</form>
</section>
