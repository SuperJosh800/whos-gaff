<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const who = $derived(data.operator.name ?? 'the person who runs this copy of Who’s Gaff');
</script>

<svelte:head><title>Privacy policy · Who's Gaff</title></svelte:head>

<article class="prose-page mx-auto max-w-2xl space-y-5">
	<header>
		<h1 class="text-3xl font-bold">Privacy policy</h1>
		<p class="text-sm text-zinc-500">Last updated 12 November 2026</p>
	</header>

	<p>
		Who’s Gaff helps friends plan nights out and nights in. This page explains what we keep about you, why, who can see it and
		how to get it deleted. We don’t sell your data, show adverts or use tracking or analytics.
	</p>

	<section>
		<h2>Who looks after your data</h2>
		<p>
			This site is run by {who}, who is the data controller under UK GDPR.
			{#if data.operator.email}
				Contact them at <a href="mailto:{data.operator.email}">{data.operator.email}</a> about anything on this page.
			{:else}
				Contact them through the group you were invited by about anything on this page.
			{/if}
		</p>
	</section>

	<section>
		<h2>What we keep</h2>
		<ul>
			<li><strong>Your account:</strong> name, email address and a scrambled (hashed) copy of your password. We can’t see your password.</li>
			<li><strong>Optional profile details:</strong> your payment link (such as a Monzo.me link) and your payday.</li>
			<li><strong>Things you add:</strong> events, date votes, RSVPs, chat messages, gaff profiles (which can include an address, wifi details and house rules), bring-list items, damage log entries, “we’ve moved” updates, getting-home plans and “home safe” check-ins, kitty expenses and payments, rounds, awards votes, photos, games you make, game and challenge results, group memberships and “who’s out?” answers.</li>
			<li><strong>Login sessions:</strong> a random code in a cookie that keeps you logged in for 30 days. We store only a scrambled copy of it.</li>
			<li><strong>Server logs:</strong> the server may briefly record errors and web addresses visited, kept for troubleshooting only.</li>
		</ul>
		<p>We don’t ask for, and you shouldn’t add, sensitive details such as health information in chats or plans.</p>
	</section>

	<section>
		<h2>Why we use it</h2>
		<p>
			We use your details only to run the app for you: to log you in, show your events, let friends coordinate and send the emails you’d
			expect (invites, “date set” emails and password resets). Our legal basis is that we need it to give you the service you signed up
			for (contract), and for safety features like “home safe” check-ins, our and your friends’ legitimate interest in everyone getting home.
		</p>
	</section>

	<section>
		<h2>Who can see it</h2>
		<ul>
			<li>People in the same event or group see your name and what you add there, such as votes, RSVPs, messages and photos.</li>
			<li>A gaff’s address and details are only shown to people who RSVP “going”.</li>
			<li>Your email address isn’t shown to other users.</li>
			<li>{who} can see the database because they run the server.</li>
		</ul>
	</section>

	<section>
		<h2>Where it’s kept and who else handles it</h2>
		<ul>
			<li>The database and photos are stored on a server run by {who}.</li>
			<li>Traffic reaches the server through Tailscale’s secure tunnel, which is encrypted (HTTPS).</li>
			{#if data.operator.emailConfigured}
				<li>Emails are sent through an email provider, which sees your address and the email’s contents.</li>
			{/if}
			<li>Links to Spotify, Google Maps or your bank only open those services if you choose to click them. Their own privacy policies apply there.</li>
		</ul>
	</section>

	<section>
		<h2>Cookies</h2>
		<p>
			We use one cookie, <code>session</code>, which keeps you logged in. It’s strictly necessary, so it doesn’t need your consent.
			There are no advertising or analytics cookies.
		</p>
	</section>

	<section>
		<h2>How long we keep it</h2>
		<ul>
			<li>Your account and what you add are kept until you delete your account.</li>
			<li>Login sessions end after 30 days, or when you log out. Password reset links expire after an hour.</li>
			<li>When you delete your account, your personal details, gaffs, messages, photos, votes and plans are deleted. Kitty payments, rounds and bring-list items others rely on stay, shown as “Deleted user”.</li>
			<li>Nightly backups of the database may hold deleted data for up to 14 days before they’re replaced.</li>
		</ul>
	</section>

	<section>
		<h2>Your rights</h2>
		<p>Under UK GDPR you can:</p>
		<ul>
			<li><strong>Get a copy</strong> of your data: use “Download my data” on your <a href="/profile">profile</a>.</li>
			<li><strong>Correct it:</strong> edit your profile, or ask.</li>
			<li><strong>Delete it:</strong> use “Delete my account” on your <a href="/profile">profile</a>.</li>
			<li><strong>Object to or restrict</strong> how we use it, by contacting {who}.</li>
		</ul>
		<p>
			If you’re unhappy with how your data is handled, you can complain to the Information Commissioner’s Office at
			<a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer">ico.org.uk</a>.
		</p>
	</section>

	<section>
		<h2>Over 18s only</h2>
		<p>Who’s Gaff includes drinking games and is for people aged 18 or over. If you think someone under 18 has an account, let us know and we’ll delete it.</p>
	</section>

	<section>
		<h2>Keeping it safe</h2>
		<p>
			Passwords and login codes are stored scrambled, the site only works over HTTPS, and login attempts are rate limited.
			If we ever find your data has been exposed in a way that puts you at risk, we’ll tell you.
		</p>
	</section>

	<section>
		<h2>Changes</h2>
		<p>If this policy changes, we’ll update the date at the top and mention anything important in the app.</p>
	</section>

	<p class="text-sm text-zinc-500">See also the <a href="/terms">terms of use</a>.</p>
</article>
