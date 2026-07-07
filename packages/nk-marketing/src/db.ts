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

// Mirrors the migration's marketing_contacts_email_format check, so form input
// fails with a clear error here instead of a raw Postgres constraint violation.
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Normalise + validate an email; throws a descriptive error on junk input. */
export const requireEmail = (email: string): string => {
	const normalized = normalizeEmail(email);
	if (!EMAIL_PATTERN.test(normalized)) {
		throw new Error(`nk-marketing: invalid email address "${email}"`);
	}
	return normalized;
};

/**
 * A 256-bit random token, hex-encoded, for an unsubscribe link. Generated in
 * app code (not via a pgcrypto column default) so the migration stays
 * extension-free and the value never leaks a row id.
 */
export const generateToken = (): string => randomBytes(32).toString("hex");
