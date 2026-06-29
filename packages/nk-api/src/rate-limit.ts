/**
 * A lightweight, dependency-free in-memory rate limiter for the API seam — the
 * pragmatic default that needs no Redis. It is a **per-instance fixed-window
 * counter**: on Vercel Fluid Compute (or any multi-replica deploy) each replica
 * keeps its own map, so the effective limit is roughly `limit * replica_count`.
 * That's still enough to cut off repeated abuse from a single client and give an
 * endpoint a first line of defence. Swap for a shared store (Upstash, Postgres)
 * if the blast radius matters more than the zero-dependency simplicity.
 *
 * The primitives (`checkRateLimit`, `getClientKey`) are framework-agnostic; the
 * `rateLimit` Hono middleware wires them into an nk-api app with the standard
 * `429` envelope and `Retry-After` / `X-RateLimit-*` headers.
 */
import type { Context, MiddlewareHandler } from "hono";

interface Bucket {
	count: number;
	resetAt: number;
}

const buckets = new Map<string, Bucket>();

const pruneIfStale = (now: number) => {
	// Cheap O(n) prune: only bother once the map is large enough to matter.
	if (buckets.size < 5000) return;
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key);
	}
};

/** The outcome of consuming a token from a window. */
export interface RateLimitResult {
	/** Whether the request is within the limit (false → should be rejected). */
	success: boolean;
	/** Remaining requests in the current window. */
	remaining: number;
	/** Wall-clock milliseconds until the window resets. */
	resetInMs: number;
}

/**
 * Consume a token from the fixed window identified by `key`. If the window does
 * not exist or has expired, a fresh one starts. Pure and synchronous — call it
 * directly when you want the primitive without the {@link rateLimit} middleware.
 */
export const checkRateLimit = (params: {
	key: string;
	limit: number;
	windowMs: number;
}): RateLimitResult => {
	const { key, limit, windowMs } = params;
	const now = Date.now();
	pruneIfStale(now);

	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return { success: true, remaining: limit - 1, resetInMs: windowMs };
	}

	if (bucket.count >= limit) {
		return { success: false, remaining: 0, resetInMs: bucket.resetAt - now };
	}

	bucket.count += 1;
	return {
		success: true,
		remaining: limit - bucket.count,
		resetInMs: bucket.resetAt - now,
	};
};

/**
 * Best-effort client IP from a request's headers, for use as a rate-limit key.
 * In order: the first hop of `x-forwarded-for` (set by Vercel), then
 * `x-real-ip`, then the constant `"unknown"` so the limiter still fires when all
 * headers are missing. Takes a standard `Headers` (`c.req.raw.headers` in Hono,
 * `req.headers` in a Next route handler) so it stays framework-agnostic.
 */
export const getClientKey = (headers: Headers): string => {
	const forwardedFor = headers.get("x-forwarded-for");
	if (forwardedFor) {
		const first = forwardedFor.split(",")[0]?.trim();
		if (first) return first;
	}
	const realIp = headers.get("x-real-ip");
	if (realIp) return realIp.trim();
	return "unknown";
};

/** Options for the {@link rateLimit} middleware. */
export interface RateLimitOptions {
	/** Max requests allowed per window. */
	limit: number;
	/** Window length in milliseconds. */
	windowMs: number;
	/**
	 * Derive the bucket key from the request context. Defaults to the client IP
	 * (`getClientKey(c.req.raw.headers)`). Override to scope by user/tenant/route
	 * — e.g. `(c) => c.get("userId") ?? getClientKey(c.req.raw.headers)`.
	 */
	key?: (c: Context) => string;
	/** Message for the `429` envelope. Default `"Too many requests"`. */
	message?: string;
}

/**
 * A Hono middleware that rate-limits by {@link RateLimitOptions.key} (client IP
 * by default). On every request it sets `X-RateLimit-Limit` / `-Remaining`; when
 * the window is exhausted it short-circuits with the standard `{ error }`
 * envelope at `429` and a `Retry-After` header (seconds). Returns the response
 * directly rather than throwing, so the headers are preserved.
 *
 * ```ts
 * app.use("/api/v1/support", rateLimit({ limit: 5, windowMs: 60_000 }));
 * ```
 */
export const rateLimit = (options: RateLimitOptions): MiddlewareHandler => {
	const keyOf = options.key ?? ((c) => getClientKey(c.req.raw.headers));
	return async (c, next) => {
		const result = checkRateLimit({
			key: keyOf(c),
			limit: options.limit,
			windowMs: options.windowMs,
		});
		c.header("X-RateLimit-Limit", String(options.limit));
		c.header("X-RateLimit-Remaining", String(result.remaining));
		if (!result.success) {
			c.header("Retry-After", String(Math.ceil(result.resetInMs / 1000)));
			return c.json({ error: options.message ?? "Too many requests" }, 429);
		}
		await next();
	};
};
