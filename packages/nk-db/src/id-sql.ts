/**
 * `@ingram-tech/nk-db/id/sql` — the id codec as Postgres functions, from
 * `id758/sql`, plus the form a site pastes into a Drizzle migration.
 *
 * The functions (`id758_encode`, `id758_decode`, `id758_prefix`) let the
 * database speak both forms of an id, so raw SQL, `psql` and RPCs need no
 * conversion in application code:
 *
 *     select * from invoices where id = id758_decode('inv_…');
 *     select id758_encode('inv', id) as id from invoices;
 *
 * They ship as text, not as a migration chain: the codec is frozen, so there
 * is never a second version to journal, and the script is `create or replace`
 * (idempotent). The PGlite harness applies it on every boot, so dev and test
 * have the functions for free; production gets them once, through the site's
 * own migrations:
 *
 *     bunx drizzle-kit generate --custom --name id758
 *     # paste `id758Migration` into the generated drizzle/NNNN_id758.sql
 *
 * Or on the fly, outside any journal: `bunx id758 sql | psql "$DATABASE_URL"`.
 */
import { ID758_SQL_STATEMENTS } from "id758/sql";

export { ID758_SQL, ID758_SQL_STATEMENTS } from "id758/sql";

/**
 * The functions as the body of a Drizzle migration file: one statement per
 * `--> statement-breakpoint`, which the migrator needs to run a multi-statement
 * file (it sends each chunk as its own query).
 */
export const id758Migration = `${ID758_SQL_STATEMENTS.join("\n--> statement-breakpoint\n")}\n`;
