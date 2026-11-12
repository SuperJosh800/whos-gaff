// Shows push notifications and opens the right page when one is tapped. It doesn't cache anything:
// the app needs the server to be useful, and stale pages would show out-of-date plans.
const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', () => sw.skipWaiting());
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));

sw.addEventListener('push', (event) => {
	const data = (event.data?.json() ?? {}) as { title?: string; body?: string; url?: string };
	event.waitUntil(
		sw.registration.showNotification(data.title ?? "Who's Gaff", {
			body: data.body ?? '',
			icon: '/icon-192.png',
			badge: '/badge-96.png',
			data: { url: data.url ?? '/' }
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = new URL((event.notification.data as { url?: string })?.url ?? '/', sw.location.origin).href;
	event.waitUntil(
		(async () => {
			const open = (await sw.clients.matchAll({ type: 'window', includeUncontrolled: true })) as WindowClient[];
			const tab = open.find((c) => new URL(c.url).origin === sw.location.origin);
			if (tab) {
				await tab.focus();
				await tab.navigate(url).catch(() => undefined);
			} else {
				await sw.clients.openWindow(url);
			}
		})()
	);
});
