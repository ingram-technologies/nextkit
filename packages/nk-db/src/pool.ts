import { Pool, type PoolConfig } from "pg";
import { dbEnv, getDatabaseUrl } from "./keys.js";

export interface CreatePoolConfig {
	/** Override the resolved connection string (defaults to the env contract). */
	connectionString?: string;
	/** PEM CA cert; when set, the server cert + hostname are verified. */
	caCert?: string;
	/** Pool size cap. Defaults to env DATABASE_POOL_MAX, or 1 for a local socket. */
	max?: number;
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const isLocal = (connectionString: string): boolean => {
	// Parse the URL: a substring check would misclassify a remote URL whose
	// password or database name happens to contain "localhost".
	try {
		return LOCAL_HOSTS.has(new URL(connectionString).hostname);
	} catch {
		return false;
	}
};

/**
 * Un-escape a PEM CA cert that arrived with literal `\n` instead of real
 * newlines. A multiline secret survives intact in the app's runtime env (e.g.
 * Vercel hands `process.env.DATABASE_CA_CERT` back with real newlines), but
 * `vercel env pull` — and most `.env` serializers — collapse it to a single
 * quoted line with `\n` escapes. A caller that then sources that file (the
 * `nk-pg-migrate` runner, a CI job) gets the literal-`\n` form, which OpenSSL
 * rejects with "self-signed certificate in certificate chain" even though the
 * deployed app verifies the very same cert fine. Normalise here, the one place
 * the cert reaches `pg`, so every caller gets verify-full regardless of how the
 * env was loaded. A correctly-newlined PEM contains no literal `\n`, so this is
 * a no-op there — idempotent and safe (base64 + the BEGIN/END lines never
 * contain a backslash).
 */
export const normalizeCaCert = (caCert: string | undefined): string | undefined =>
	caCert?.includes("\\n") ? caCert.replace(/\\n/g, "\n") : caCert;

/**
 * The one shared `pg.Pool`. Reuse this for everything — app queries (via
 * `createQueries` / Drizzle) AND Better Auth's adapter — so there's exactly one
 * pool per process (the playbook's rule).
 *
 * TLS handling matches the fleet standard (lifted from nk-auth's
 * `createAuthPool`):
 *
 *   - `caCert` set  -> verify the server cert + hostname (`sslmode=verify-full`).
 *   - local host    -> no TLS, and cap at `max: 1` (the PGlite socket server is
 *                      single-connection/multiplexed; a larger pool breaks dev).
 *   - otherwise     -> TLS **without** chain verification. Managed certs (e.g.
 *                      DigitalOcean) aren't in Node's trust store, so full
 *                      verification fails with "self-signed certificate in
 *                      certificate chain"; the link is still encrypted. `sslmode`
 *                      is stripped from the URL because `pg` ignores the `ssl`
 *                      object when the URL carries SSL settings.
 *
 * On Vercel Fluid / serverless, hold the pool on `globalThis` so warm
 * invocations reuse it instead of opening a connection per request (see the
 * app-side `src/lib/db.ts` pattern in docs/db-package.md).
 */
export const createPool = (config: CreatePoolConfig = {}): Pool => {
	// Resolve the connection string WITHOUT throwing when it is simply absent.
	// createPool runs at module load in every app's `lib/db`, so importing that
	// module — and therefore `next build` collecting page data, a unit test, or
	// a CLI tool that never queries — must stay side-effect-free. Validate the
	// full env (which *does* throw fast on a present-but-invalid value) only once
	// a URL is known to exist; when nothing is configured, defer the error to
	// first use via `unconfiguredPool`.
	const env =
		config.connectionString !== undefined
			? undefined
			: getDatabaseUrl() !== undefined
				? dbEnv()
				: undefined;
	const connectionString = config.connectionString ?? env?.connectionString;
	if (!connectionString) {
		return unconfiguredPool();
	}
	const caCert = normalizeCaCert(config.caCert ?? env?.caCert);
	const local = isLocal(connectionString);
	// Local wins over the env: a pulled .env (e.g. `vercel env pull`) carries the
	// production DATABASE_POOL_MAX/DATABASE_CA_CERT, but the PGlite socket is
	// single-connection and speaks no TLS — honoring them breaks dev. An explicit
	// `config.max` in code still applies.
	const max = config.max ?? (local ? 1 : env?.poolMax);

	const base: PoolConfig = max === undefined ? {} : { max };

	if (local) {
		return new Pool({ ...base, connectionString });
	}
	if (caCert) {
		return new Pool({
			...base,
			connectionString,
			ssl: { ca: caCert, rejectUnauthorized: true },
		});
	}
	const url = new URL(connectionString);
	url.searchParams.delete("sslmode");
	return new Pool({
		...base,
		connectionString: url.toString(),
		ssl: { rejectUnauthorized: false },
	});
};

/**
 * A pool that constructs cleanly but rejects any real operation with the clear
 * "set DATABASE_URL" error. Returned by {@link createPool} when no connection
 * string is configured.
 *
 * Constructing the pool — which happens at module load in every app's `lib/db`,
 * and therefore during `next build`'s page-data collection and in unit tests —
 * must not throw just because a database isn't wired up. A process that then
 * runs a real query without a URL is genuinely misconfigured and fails fast and
 * legibly here; the env is fixed at process start, so this is never a transient
 * miss. `query` and `connect` are the only entry points that reach the wire
 * (Drizzle and `createQueries` go through them), so guarding both is sufficient.
 *
 * The rejection is deferred to a macrotask, not returned already-rejected, so it
 * mimics real connection I/O: an async framework that inspects the in-flight
 * promise before it settles — e.g. Next.js partial prerendering deciding a
 * segment is dynamic — sees a pending promise and postpones it, exactly as it
 * would for a real (reachable or not) pool. An already-rejected promise would
 * instead surface as a synchronous render error at build.
 */
const unconfiguredPool = (): Pool => {
	const pool = new Pool();
	const reject = (): Promise<never> =>
		new Promise((_resolve, rej) => {
			setTimeout(
				() =>
					rej(
						new Error(
							"@ingram-tech/nk-db: no database connection string — set DATABASE_URL.",
						),
					),
				0,
			);
		});
	pool.query = reject as typeof pool.query;
	pool.connect = reject as typeof pool.connect;
	return pool;
};
