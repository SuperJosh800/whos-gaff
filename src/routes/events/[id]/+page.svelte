<script lang="ts">
	import Poll from './Poll.svelte';
	import Rsvps from './Rsvps.svelte';
	import Invite from './Invite.svelte';
	import Chat from './Chat.svelte';
	import HostSettings from './HostSettings.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

<div class="space-y-5">
	{#if data.event.starts_at}
		<Rsvps {data} />
	{:else}
		<Poll {data} />
	{/if}

	<Chat {data} />

	{#if data.isHost}
		<Invite {data} invited={form && 'invited' in form ? form.invited : undefined} />
		<HostSettings {data} saved={!!(form && 'saved' in form)} />
	{/if}
</div>
