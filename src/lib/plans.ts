/** What kind of night a "who's out?" ping is for (WG-30). `ask` finishes "who's out…". */
export const PLANS = {
	pub: { label: 'Pub', ask: ' for the pub', title: 'Pub' },
	home: { label: 'Home', ask: ' for a night in', title: 'Night in' },
	club: { label: 'Club', ask: ' clubbing', title: 'Club night' },
	food: { label: 'Food', ask: ' for food', title: 'Food' },
	anything: { label: 'Anything', ask: '', title: 'Night out' }
} as const;

export type Plan = keyof typeof PLANS;
