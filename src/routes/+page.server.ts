import { listDashboardEvents } from '#lib/server/dashboard.ts';
import { listNotifications, markAllRead } from '#lib/server/notifications.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) return { dashboard: null };
	const notifications = listNotifications(locals.user.id);
	markAllRead(locals.user.id);
	return { dashboard: { ...listDashboardEvents(locals.user.id), notifications } };
};
