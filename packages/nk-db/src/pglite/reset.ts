// Reset a PGlite/Postgres test database to empty between tests — the canonical
// "introspect public tables, then TRUNCATE … RESTART IDENTITY CASCADE" unit,
// kept transport-agnostic so the socket-backed `createTestDb` and any in-process
// Drizzle/PGlite harness share one implementation instead of each re-deriving the
// SQL (and the easy-to-forget empty-list guard) and drifting apart.
//
// Deliberately zero imports: this loads via the dedicated
// "@ingram-tech/nk-db/pglite/reset" subpath, so an in-process consumer gets the
// reset logic WITHOUT dragging in PGlite or the PGLiteSocketServer that
// `./index.ts` imports at the top level.

/**
 * A row-returning query — `pg.Pool.query`, raw PGlite `.query`, etc. The
 * `pg_tables` introspection reads rows back, so this can't be a fire-and-forget
 * `exec(sql)`: the contract has to surface `{ rows }`.
 */
export type Queryable = (sql: string) => Promise<{ rows: { tablename: string }[] }>;

/**
 * TRUNCATE every table in the `public` schema, resetting identity sequences.
 * Call in a Vitest `beforeEach`. No-op when the schema is empty (e.g. before
 * migrations have run), so it's safe to call unconditionally.
 */
export async function resetPublicTables(query: Queryable): Promise<void> {
	const { rows } = await query(
		"select tablename from pg_tables where schemaname = 'public'",
	);
	if (rows.length === 0) return;
	const list = rows.map((row) => `"${row.tablename}"`).join(", ");
	await query(`truncate table ${list} restart identity cascade`);
}
