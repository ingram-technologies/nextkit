import { Pool, type PoolConfig } from "pg";
import { dbEnv } from "./keys";

export interface CreatePoolConfig {
	/** Override the resolved connection string (defaults to the env contract). */
	connectionString?: string;
	/** PEM CA cert; when set, the server cert + hostname are verified. */
	caCert?: string;
	/** Pool size cap. Defaults to env DATABASE_POOL_MAX, or 1 for a local socket. */
	max?: number;
}

const isLocal = (connectionString: string): boolean =>
	connectionString.includes("127.0.0.1") || connectionString.includes("localhost");

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
 *   - otherwise     -> TLS **without** chain verification. Managed certs (DO,
 *                      Supabase) aren't in Node's trust store, so full
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
	const env = config.connectionString ? undefined : dbEnv();
	const connectionString = config.connectionString ?? env?.connectionString;
	if (!connectionString) {
		throw new Error("@ingram-tech/nk-db: createPool needs a connection string.");
	}
	const caCert = config.caCert ?? env?.caCert;
	const local = isLocal(connectionString);
	const max = config.max ?? env?.poolMax ?? (local ? 1 : undefined);

	const base: PoolConfig = max === undefined ? {} : { max };

	if (caCert) {
		return new Pool({
			...base,
			connectionString,
			ssl: { ca: caCert, rejectUnauthorized: true },
		});
	}
	if (local) {
		return new Pool({ ...base, connectionString });
	}
	const url = new URL(connectionString);
	url.searchParams.delete("sslmode");
	return new Pool({
		...base,
		connectionString: url.toString(),
		ssl: { rejectUnauthorized: false },
	});
};
