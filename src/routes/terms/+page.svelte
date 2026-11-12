<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const who = $derived(data.operator.name ?? 'the person who runs this copy of Who’s Gaff');
</script>

<svelte:head><title>Terms of use · Who's Gaff</title></svelte:head>

<article class="prose-page mx-auto max-w-2xl space-y-5">
	<header>
		<h1 class="text-3xl font-bold">Terms of use</h1>
		<p class="text-sm text-zinc-500">Last updated 12 November 2026</p>
	</header>

	<p>
		Who’s Gaff is a free app run by {who} for friends to plan nights together. By making an account you agree to these terms.
		Our <a href="/privacy">privacy policy</a> explains what happens to your data.
	</p>

	<section>
		<h2>Who can use it</h2>
		<p>You must be 18 or over. Use your real name or a name your friends will recognise, and keep your password to yourself.</p>
	</section>

	<section>
		<h2>Drink responsibly</h2>
		<ul>
			<li>Games and challenges are just for fun and always optional. Saying no, skipping a card or switching to soft drinks is always fine. Nobody should be pressured to drink.</li>
			<li>Know your limits. The UK Chief Medical Officers advise drinking no more than 14 units a week, spread over several days.</li>
			<li>Never drink and drive, and don’t do any challenge that’s unsafe, illegal or that someone hasn’t agreed to.</li>
			<li>Look after each other. Use the getting-home plans and “home safe” check-ins.</li>
		</ul>
		<p class="text-sm">
			Worried about drinking? <a href="https://www.drinkaware.co.uk" target="_blank" rel="noopener noreferrer">Drinkaware</a> has advice.
			In an emergency, call 999.
		</p>
	</section>

	<section>
		<h2>What you post</h2>
		<p>You’re responsible for what you add. Don’t post anything that:</p>
		<ul>
			<li>is illegal, threatening, harassing or hateful</li>
			<li>shares someone else’s private details or photos of them without their permission</li>
			<li>is spam, or tries to break or misuse the app or other people’s accounts.</li>
		</ul>
		<p>{who} may remove content or close accounts that break these rules.</p>
	</section>

	<section>
		<h2>Hosting and money</h2>
		<ul>
			<li>Hosts decide who gets a gaff’s address and house rules. Only share what you’re happy for guests to see.</li>
			<li>The damage log and awards are for banter, not formal claims.</li>
			<li>The kitty and rounds tracker only keep a record of who owes what. Who’s Gaff doesn’t move money, and payments happen in your own banking app.</li>
		</ul>
	</section>

	<section>
		<h2>No guarantees</h2>
		<p>
			The app is provided free and as it is. We do our best to keep it running and your data safe, but it may sometimes be down or have bugs,
			so don’t rely on it as your only safety plan for getting home. As far as the law allows, we aren’t responsible for losses from using it.
			Nothing in these terms limits rights you have by law.
		</p>
	</section>

	<section>
		<h2>Leaving</h2>
		<p>You can delete your account at any time from your <a href="/profile">profile</a>.</p>
	</section>

	<section>
		<h2>Changes and law</h2>
		<p>If we change these terms, we’ll update the date at the top. These terms are governed by the law of England and Wales.</p>
		{#if data.operator.email}<p>Questions: <a href="mailto:{data.operator.email}">{data.operator.email}</a>.</p>{/if}
	</section>
</article>
