import { Pool } from "pg";

const isLocal = (connectionString: string): boolean =>
	connectionString.includes("127.0.0.1") || connectionString.includes("localhost");

/**
 * A `pg` Pool for Better Auth's direct database connection, with the right TLS
 * for each kind of host:
 *
 *   - `caCert` set → verify the server cert + hostname against it
 *     (equivalent to `sslmode=verify-full`).
 *   - local (`127.0.0.1`/`localhost`) → no TLS.
 *   - otherwise (managed Postgres like Supabase) → TLS **without** chain
 *     verification. Supabase's cert chain isn't in Node's trust store, so plain
 *     verification fails with "self-signed certificate in certificate chain";
 *     the connection is still encrypted. `sslmode` is stripped from the URL
 *     because `pg` ignores the `ssl` object when the URL carries SSL settings.
 */
export const createAuthPool = (config: {
	connectionString: string;
	/** PEM CA cert; when set, the server cert + hostname are verified. */
	caCert?: string;
}): Pool => {
	if (config.caCert) {
		return new Pool({
			connectionString: config.connectionString,
			ssl: { ca: config.caCert, rejectUnauthorized: true },
		});
	}
	if (isLocal(config.connectionString)) {
		return new Pool({ connectionString: config.connectionString });
	}
	const url = new URL(config.connectionString);
	url.searchParams.delete("sslmode");
	return new Pool({
		connectionString: url.toString(),
		ssl: { rejectUnauthorized: false },
	});
};
