import { createPool } from "@ingram-tech/nk-db";
import type { Pool } from "pg";

/**
 * A `pg` Pool for Better Auth's direct database connection.
 *
 * @deprecated Thin alias for `createPool` from `@ingram-tech/nk-db` — the one
 * place pool construction and TLS handling live. Kept so existing call sites
 * (`lib/db.ts` calling `createAuthPool({ connectionString, caCert })`) keep
 * working, and so Better Auth shares the **exact same pool implementation** as
 * app queries — the "one pool per process" rule. Prefer importing `createPool`
 * directly in new code.
 *
 * TLS handling (CA-verified when `caCert` is set; plain-TLS for other managed
 * hosts; no TLS for localhost), and the local `max: 1` cap (for the PGlite
 * socket), all live in `createPool`.
 */
export const createAuthPool = (config: {
	connectionString: string;
	/** PEM CA cert; when set, the server cert + hostname are verified. */
	caCert?: string;
}): Pool =>
	createPool({
		connectionString: config.connectionString,
		caCert: config.caCert,
	});
