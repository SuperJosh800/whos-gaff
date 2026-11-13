<script lang="ts">
	// Turns push notifications on or off for this phone or browser. iPhones only allow push once the
	// app has been added to the home screen, so it says how when that's the problem.
	let { publicKey }: { publicKey: string } = $props();

	type State = 'loading' | 'unsupported' | 'install' | 'blocked' | 'off' | 'on';
	let status = $state<State>('loading');
	let busy = $state(false);
	let error = $state('');

	const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
	const installed = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

	async function check() {
		if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
			status = ios() && !installed() ? 'install' : 'unsupported';
			return;
		}
		if (Notification.permission === 'denied') return void (status = 'blocked');
		const reg = await registration();
		if (!reg) return void (status = 'unsupported');
		// The browser may still be subscribed for someone who logged out here, so ask the server too.
		const sub = await reg.pushManager.getSubscription();
		const res = sub && (await fetch(`/push?endpoint=${encodeURIComponent(sub.endpoint)}`).catch(() => null));
		status = res?.ok && ((await res.json()) as { on: boolean }).on ? 'on' : 'off';
	}

	/** The service worker, or null if it never starts (then the browser can't do push here). */
	function registration() {
		const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
		return Promise.race([navigator.serviceWorker.ready, timeout]);
	}

	function keyBytes(base64url: string) {
		const raw = atob(base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4));
		return Uint8Array.from(raw, (c) => c.charCodeAt(0));
	}

	async function turnOn() {
		busy = true;
		error = '';
		try {
			if ((await Notification.requestPermission()) !== 'granted') return void (status = 'blocked');
			const reg = await registration();
			if (!reg) throw new Error();
			const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
			const res = await fetch('/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub) });
			if (!res.ok) throw new Error();
			status = 'on';
		} catch {
			error = 'Couldn’t turn notifications on. Try again.';
		} finally {
			busy = false;
		}
	}

	async function turnOff() {
		busy = true;
		error = '';
		try {
			const sub = await (await registration())?.pushManager.getSubscription();
			if (sub) {
				const res = await fetch('/push', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
				if (!res.ok) throw new Error();
				await sub.unsubscribe();
			}
			status = 'off';
		} catch {
			error = 'Couldn’t turn notifications off. Try again.';
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		void check();
	});
</script>

<section class="card space-y-3" aria-labelledby="notifications">
	<h2 id="notifications">Notifications on this phone</h2>
	{#if status === 'on'}
		<div class="grid grid-cols-[1fr_auto] border border-lime text-sm">
			<p class="px-3 py-2.5"><span class="badge text-lime">On</span> Game invites, “we’ve moved” and other updates buzz this phone.</p>
			<button class="border-l border-lime px-3 text-[11px] font-extrabold tracking-widest uppercase hover:bg-zinc-100" onclick={turnOff} disabled={busy}>Turn off</button>
		</div>
	{:else if status === 'off'}
		<p class="text-sm text-zinc-600">Get game invites, “we’ve moved” updates and home-safe nudges even when the app is closed.</p>
		<button class="btn w-full" onclick={turnOn} disabled={busy}>{busy ? 'Turning on…' : 'Turn on notifications'}</button>
	{:else if status === 'install'}
		<p class="text-sm text-zinc-600">
			On iPhone, add Who’s Gaff to your home screen first: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. Open it from there and turn notifications on here.
		</p>
	{:else if status === 'blocked'}
		<p class="text-sm text-zinc-600">Notifications are blocked for this site. Allow them in your browser or phone settings, then come back.</p>
	{:else if status === 'unsupported'}
		<p class="text-sm text-zinc-500">This browser can’t get notifications.</p>
	{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</section>
