/**
 * Environment contract for @ingram-tech/nk-db.
 *
 * Following the "each package owns its own env validation" pattern (see
 * @ingram-tech/nk-auth). Env vars are external input, so we parse them with Zod
 * (per docs/code-style.md) rather than reading `process.env` ad hoc.
 *
 * The connection string comes from `DATABASE_URL` — our DO cluster, or the local
 * PGlite socket in dev (see docs/db-package.md).
 *
 * Optional TLS / pool controls:
 *   DATABASE_SSL        — booleanish flag; only "true" sets DbEnv.ssl, but other
 *                         libpq values (disable/require/…) are tolerated, not rejected
 *   DATABASE_CA_CERT    — PEM CA; when set, verify the server cert + hostname
 *   DATABASE_POOL_MAX   — pool size cap; keep small on serverless (e.g. 5)
 */

import { z } from "zod";

const schema = z.object({
	DATABASE_URL: z.string().min(1).optional(),
	// Booleanish, but tolerant: only "true" flips DbEnv.ssl, yet libpq-style
	// values (disable/require/prefer/…) are accepted rather than throwing —
	// createPool decides TLS from the CA cert + host, never from this flag.
	DATABASE_SSL: z.string().optional(),
	DATABASE_CA_CERT: z.string().min(1).optional(),
	DATABASE_POOL_MAX: z.coerce.number().int().positive().optional(),
});

export interface DbEnv {
	/** The resolved connection string (precedence applied). */
	connectionString: string;
	/** PEM CA cert; when set, the pool verifies the server cert + hostname. */
	caCert?: string;
	/** Whether TLS was explicitly requested via DATABASE_SSL. */
	ssl: boolean;
	/** Pool size cap, if configured. */
	poolMax?: number;
}

/**
 * Resolve the connection string from the environment, without validating the
 * rest of the contract. Returns `undefined` if unset — useful for "is a database
 * configured?" checks (e.g. degrade in local dev).
 */
export const getDatabaseUrl = (
	env: NodeJS.ProcessEnv = process.env,
): string | undefined => env.DATABASE_URL;

/**
 * Read and validate the nk-db env vars at once. Throws a single error listing
 * everything missing/invalid so a misconfigured site fails fast at startup
 * rather than at first query.
 */
export const dbEnv = (): DbEnv => {
	const result = schema.safeParse(process.env);
	if (!result.success) {
		const issues = result.error.issues
			.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
			.join(", ");
		throw new Error(`@ingram-tech/nk-db: invalid environment — ${issues}`);
	}
	const connectionString = getDatabaseUrl();
	if (!connectionString) {
		throw new Error(
			"@ingram-tech/nk-db: no database connection string — set DATABASE_URL.",
		);
	}
	return {
		connectionString,
		caCert: result.data.DATABASE_CA_CERT,
		ssl: result.data.DATABASE_SSL === "true",
		poolMax: result.data.DATABASE_POOL_MAX,
	};
};

/** Whether a database connection string is present (degrade gracefully if not). */
export const isConfigured = (): boolean => getDatabaseUrl() !== undefined;
