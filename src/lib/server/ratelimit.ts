// In-memory rate limits for logging in, signing up and password resets.
// The app runs as one process (see README), so a Map is enough; limits reset on restart.

type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();
// Enough for any real crowd; past it the oldest buckets are dropped so memory stays bounded.
const MAX_BUCKETS = 50_000;

function remember(key: string, bucket: Bucket) {
	if (!buckets.has(key) && buckets.size >= MAX_BUCKETS) buckets.delete(buckets.keys().next().value!);
	buckets.set(key, bucket);
}

/**
 * Records an attempt under `key` and says whether it is allowed: at most `limit`
 * attempts in any `windowMs`. Returns the seconds to wait when it is not.
 */
export function attempt(key: string, limit: number, windowMs: number, now = Date.now()) {
	const bucket = buckets.get(key) ?? { hits: [] };
	bucket.hits = bucket.hits.filter((t) => t > now - windowMs);
	if (bucket.hits.length >= limit) {
		remember(key, bucket);
		return { ok: false as const, retryAfter: Math.ceil((bucket.hits[0] + windowMs - now) / 1000) };
	}
	bucket.hits.push(now);
	remember(key, bucket);
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
 * Fails if any limit is used up; otherwise records an attempt against each. A refused attempt
 * isn't recorded, so a blocked visitor can't keep creating buckets with new keys.
 * A limit whose key is null (e.g. the IP address is unknown) is skipped.
 */
export function attemptAll(limits: { key: string | null; limit: number; windowMs: number }[], now = Date.now()) {
	const active = limits.filter((l): l is { key: string; limit: number; windowMs: number } => l.key !== null);
	let worst = 0;
	for (const { key, limit, windowMs } of active) {
		const hits = (buckets.get(key)?.hits ?? []).filter((t) => t > now - windowMs);
		if (hits.length >= limit) worst = Math.max(worst, Math.ceil((hits[0] + windowMs - now) / 1000));
	}
	if (worst) return waitMessage(worst);
	for (const { key, limit, windowMs } of active) attempt(key, limit, windowMs, now);
	return null;
}

// Drop empty buckets now and then so the map can't grow without limit.
const sweep = setInterval(() => {
	const cutoff = Date.now() - HOUR; // the longest window
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
