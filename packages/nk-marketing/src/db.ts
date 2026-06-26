/**
 * The database surface nk-marketing needs, by injection — identical in spirit to
 * `@ingram-tech/nk-billing`'s `Queryable`. A structural `pg` Pool/PoolClient and
 * nk-db's query helpers both satisfy it, so the consuming site passes whatever
 * it already has and owns the tenancy/transaction story.
 */

import { randomBytes } from "node:crypto";

export interface Queryable {
	// R is intentionally unconstrained so a structural `pg` Pool/PoolClient,
	// nk-db's helpers, and our own row interfaces (no index signature) all fit.
	query<R = Record<string, unknown>>(
		sql: string,
		params?: unknown[],
	): Promise<{ rows: R[] }>;
}

/** Normalise an email for storage and lookup — trimmed + lowercased. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * A 256-bit random token, hex-encoded, for an unsubscribe link. Generated in
 * app code (not via a pgcrypto column default) so the migration stays
 * extension-free and the value never leaks a row id.
 */
export const generateToken = (): string => randomBytes(32).toString("hex");
