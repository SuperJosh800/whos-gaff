<script lang="ts">
	import { enhance } from '$app/forms';
	import { CUSTOM, SETTINGS, SETTING_IDS } from '#lib/activities.ts';

	type Values = { name: string; emoji: string; setting: string; rules: string; scored: boolean; cards: string };
	let { values, error, submit, reset = true }: { values?: Values; error?: string; submit: string; reset?: boolean } = $props();
	const v = $derived(values ?? { name: '', emoji: '🍻', setting: 'gaff', rules: '', scored: false, cards: '' });
</script>

<form method="POST" action="?/save" use:enhance={() => async ({ update }) => update({ reset })} class="card space-y-4">
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<input type="hidden" name="emoji" value={v.emoji} />
	<div class="grid gap-3 sm:grid-cols-[1fr_10rem]">
		<div>
			<label class="label" for="name">Name</label>
			<input class="input" id="name" name="name" required maxlength={CUSTOM.name} placeholder="Pres power hour" value={v.name} />
		</div>
		<div>
			<label class="label" for="setting">Best at</label>
			<select class="input" id="setting" name="setting" value={v.setting}>
				{#each SETTING_IDS as id (id)}<option value={id}>{SETTINGS[id].label}</option>{/each}
			</select>
		</div>
	</div>
	<div>
		<label class="label" for="rules">Rules</label>
		<input class="input" id="rules" name="rules" maxlength={CUSTOM.rules} placeholder="Do what the card says. Refuse and finish your drink." value={v.rules} />
	</div>
	<div>
		<label class="label" for="cards">Cards, one per line</label>
		<textarea class="input min-h-48 font-mono text-xs leading-relaxed" id="cards" name="cards" required
			placeholder={'{1}, finish your drink.\n{1} buys {2} a drink.\nWhole table takes a shot if {1} can’t name 5 cheeses.\nsecret: Get {2} to say “banana” | {1}: take a sip of your drink.'}>{v.cards}</textarea>
		<ul class="mt-2 space-y-1 text-xs text-zinc-500">
			<li><code class="text-zinc-700">{'{1}'}</code>, <code class="text-zinc-700">{'{2}'}</code> and <code class="text-zinc-700">{'{3}'}</code> become different random people on the night.</li>
			<li>Start a line with <code class="text-zinc-700">secret:</code> and only the picked player sees it. Put an easy fake task after a <code class="text-zinc-700">|</code> for everyone else to see, or it uses “take a sip of your drink”.</li>
			<li>At least 3 cards, up to {CUSTOM.maxCards}.</li>
		</ul>
	</div>
	<label class="flex items-start gap-2 text-sm">
		<input type="checkbox" name="scored" checked={v.scored} class="mt-1" />
		<span><strong>Keep score:</strong> each card goes to the person it names, who can do it for points (2 for secret missions, 1 otherwise) or bail.</span>
	</label>
	<button class="btn">{submit}</button>
</form>
