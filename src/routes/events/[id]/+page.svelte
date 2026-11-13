<script lang="ts">
	import Poll from './Poll.svelte';
	import Rsvps from './Rsvps.svelte';
	import Invite from './Invite.svelte';
	import Chat from './Chat.svelte';
	import HostSettings from './HostSettings.svelte';
	import Tickets from './Tickets.svelte';
	import Theme from './Theme.svelte';
	import Venue from './Venue.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

<div class="space-y-5">
	{#if data.event.starts_at}
		<Rsvps {data} />
		<Tickets {data} nudged={form && 'nudged' in form ? form.nudged : undefined} />
	{:else}
		<Poll {data} />
	{/if}

	<Venue {data} />
	<Theme {data} />

	<Chat {data} />

	{#if data.isHost}
		<Invite {data} invited={form && 'invited' in form ? form.invited : undefined} />
		<HostSettings {data} saved={!!(form && 'saved' in form)} />
	{/if}
</div>
