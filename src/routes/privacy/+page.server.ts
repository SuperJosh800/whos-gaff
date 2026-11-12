import { operator } from '#lib/server/operator.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ operator: operator() });
