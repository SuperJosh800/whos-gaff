// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { User } from '#lib/server/auth.ts';

declare global {
	namespace App {
		interface Locals {
			user: User | null;
			/** The stored id of this login's session, set when user is. */
			sessionId: string | null;
		}
	}
}

export {};
