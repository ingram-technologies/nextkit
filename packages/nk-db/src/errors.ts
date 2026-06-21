// Inspect Postgres driver errors by SQLSTATE without hand-rolling the `.cause`
// chain walk at every call site. `pg` puts the SQLSTATE on `error.code`, but
// wrappers (Drizzle, our own helpers) often re-throw with the original error
// nested under `.cause`, so a flat `err.code === …` check silently misses it.

/** SQLSTATE `23505` — `unique_violation`. */
export const PG_UNIQUE_VIOLATION = "23505";

/**
 * True when `error`, or anything in its `.cause` chain, is a Postgres error
 * whose SQLSTATE equals `code`.
 *
 * Prefer `INSERT … ON CONFLICT` over catch-and-branch where you can (it avoids
 * the pooled-connection-destroy footgun — see `docs/db-package.md`), but use
 * this for the cases that genuinely must inspect the failure.
 */
export const isPgError = (error: unknown, code: string): boolean => {
	let current: unknown = error;
	while (current !== null && current !== undefined) {
		if (typeof current === "object" && "code" in current && current.code === code) {
			return true;
		}
		current = current instanceof Error ? current.cause : undefined;
	}
	return false;
};

/** Convenience for the most common check: a `23505` unique violation. */
export const isUniqueViolation = (error: unknown): boolean =>
	isPgError(error, PG_UNIQUE_VIOLATION);
