/** What kind of night a "who's out?" ping is for (WG-30). `ask` finishes "who's out…". */
export const PLANS = {
	pub: { label: 'Pub', emoji: '🍺', ask: ' for the pub', title: 'Pub' },
	home: { label: 'Home', emoji: '🏠', ask: ' for a night in', title: 'Night in' },
	club: { label: 'Club', emoji: '🪩', ask: ' clubbing', title: 'Club night' },
	food: { label: 'Food', emoji: '🍔', ask: ' for food', title: 'Food' },
	anything: { label: 'Anything', emoji: '🍻', ask: '', title: 'Night out' }
} as const;

export type Plan = keyof typeof PLANS;
