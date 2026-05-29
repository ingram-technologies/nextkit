import { Pool } from "pg";

/**
 * A `pg` Pool for Better Auth's direct database connection, with optional
 * SSL CA verification (equivalent to `sslmode=verify-full`). Keep `sslmode` out
 * of the connection string — `pg` discards the `ssl` object when the URL
 * carries SSL settings.
 */
export const createAuthPool = (config: {
	connectionString: string;
	/** PEM CA cert; when set, the server cert + hostname are verified. */
	caCert?: string;
}): Pool =>
	new Pool({
		connectionString: config.connectionString,
		ssl: config.caCert
			? { ca: config.caCert, rejectUnauthorized: true }
			: undefined,
	});
