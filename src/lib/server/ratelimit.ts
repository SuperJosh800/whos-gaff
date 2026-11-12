// In-memory rate limits for logging in, signing up and password resets.
// The app runs as one process (see README), so a Map is enough; limits reset on restart.

type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();

/**
 * Records an attempt under `key` and says whether it is allowed: at most `limit`
 * attempts in any `windowMs`. Returns the seconds to wait when it is not.
 */
export function attempt(key: string, limit: number, windowMs: number, now = Date.now()) {
	const bucket = buckets.get(key) ?? { hits: [] };
	bucket.hits = bucket.hits.filter((t) => t > now - windowMs);
	if (bucket.hits.length >= limit) {
		buckets.set(key, bucket);
		return { ok: false as const, retryAfter: Math.ceil((bucket.hits[0] + windowMs - now) / 1000) };
	}
	bucket.hits.push(now);
	buckets.set(key, bucket);
	return { ok: true as const };
}

/** Forgets the attempts under `key`, e.g. after a successful login. */
export function clearAttempts(key: string) {
	buckets.delete(key);
}

export function waitMessage(seconds: number) {
	const minutes = Math.ceil(seconds / 60);
	return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

/**
 * Checks every limit, recording an attempt against each; fails if any is used up.
 * A limit whose key is null (e.g. the IP address is unknown) is skipped.
 */
export function attemptAll(limits: { key: string | null; limit: number; windowMs: number }[], now = Date.now()) {
	let worst = 0;
	for (const { key, limit, windowMs } of limits) {
		if (key === null) continue;
		const result = attempt(key, limit, windowMs, now);
		if (!result.ok) worst = Math.max(worst, result.retryAfter);
	}
	return worst ? waitMessage(worst) : null;
}

// Drop empty buckets now and then so the map can't grow without limit.
const sweep = setInterval(() => {
	const cutoff = Date.now() - 24 * 60 * 60 * 1000;
	for (const [key, bucket] of buckets) {
		if (!bucket.hits.some((t) => t > cutoff)) buckets.delete(key);
	}
}, 60 * 60 * 1000);
sweep.unref?.();

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;

/**
 * A rate-limit key for the visitor's IP address, or null when the server can't tell it apart from
 * other visitors (behind a proxy without ADDRESS_HEADER set, everyone looks like the proxy).
 */
export function ipKey(prefix: string, event: { getClientAddress(): string }) {
	let ip: string;
	try {
		ip = event.getClientAddress();
	} catch {
		return null;
	}
	if (!ip || (!process.env.ADDRESS_HEADER && process.env.NODE_ENV === 'production')) return null;
	return `${prefix}:ip:${ip}`;
}
