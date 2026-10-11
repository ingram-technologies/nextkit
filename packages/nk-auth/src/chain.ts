import { inspectMigrations, type MigrationStatus } from "@ingram-tech/nk-db/migrate";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { Pool } from "pg";
import { SHIPPED_AUTH_CHAIN } from "./shipped-chain.js";

/**
 * The migration chain this package ships: `migrations/` in the installed
 * package. Resolved through the package manifest, at call time, so a bundler
 * that rewrites `import.meta.url` (Next's server build) still lands on the
 * folder under `node_modules`, and never sees a URL it would try to inline.
 */
export const authMigrationsFolder = (): string =>
	dirname(
		dirname(
			createRequire(import.meta.url).resolve(
				"@ingram-tech/nk-auth/migrations/meta/_journal.json",
			),
		),
	);

/** The journal table the README tells a site to record the chain in. */
export const AUTH_MIGRATIONS_TABLE = "__nkauth_migrations";

/** The shape of a `pg` Pool as far as the chain check needs it. */
const isPool = (value: unknown): value is Pool =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as { query?: unknown }).query === "function" &&
	typeof (value as { connect?: unknown }).connect === "function";

/**
 * Thrown when a site runs this package's chain but has not applied all of it:
 * the installed nk-auth expects a schema the database does not have yet. Every
 * Better Auth bump that touches the schema ships as a new file in the chain,
 * so this is the "deployed before migrating" mistake, caught at the first
 * session read instead of at a customer's sign-in.
 */
export class AuthChainNotAppliedError extends Error {
	readonly pending: readonly string[];
	constructor(pending: readonly string[]) {
		super(
			`@ingram-tech/nk-auth: ${pending.length} migration(s) of the shipped auth chain are not applied to this database (${pending.join(", ")}). Run \`db:migrate\` (nk-pg-migrate --migrations node_modules/@ingram-tech/nk-auth/migrations --table ${AUTH_MIGRATIONS_TABLE}) before deploying this version.`,
		);
		this.name = "AuthChainNotAppliedError";
		this.pending = pending;
	}
}

export interface AuthChainCheckOptions {
	/** The journal table the site records the chain in. Default `__nkauth_migrations`. */
	migrationsTable?: string;
	/** The journal table's schema. Default `drizzle`. */
	migrationsSchema?: string;
}

const journalOf = (options: AuthChainCheckOptions) => ({
	schema: options.migrationsSchema ?? "drizzle",
	table: options.migrationsTable ?? AUTH_MIGRATIONS_TABLE,
});

/**
 * Whether this role can read the journal table. Looked up in pg_catalog, which
 * every role can read: `to_regclass` raises "permission denied" instead of
 * returning null when the role lacks USAGE on the schema, and that broke every
 * session read on a site whose auth role has no business in `drizzle`.
 */
const journalReadable = async (
	pool: Pool,
	schema: string,
	table: string,
): Promise<boolean> => {
	const { rows } = await pool.query<{ readable: boolean }>(
		`select has_schema_privilege(n.oid, 'USAGE')
			and has_table_privilege(c.oid, 'SELECT') as readable
		from pg_catalog.pg_class c
		join pg_catalog.pg_namespace n on n.oid = c.relnamespace
		where n.nspname = $1 and c.relname = $2`,
		[schema, table],
	);
	return rows[0]?.readable === true;
};

const quoteIdent = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/**
 * The same verdict as {@link assertAuthChainApplied}, decided against
 * {@link SHIPPED_AUTH_CHAIN} instead of the `migrations/` folder: a shipped
 * file is pending when its hash is not recorded (the set difference nk-db's
 * runner uses). It never touches the filesystem, so it is safe inside a
 * site's server bundle, where it runs on the first session read.
 */
const assertShippedChainRecorded = async (
	pool: Pool,
	options: AuthChainCheckOptions,
): Promise<void> => {
	const { schema, table } = journalOf(options);
	if (!(await journalReadable(pool, schema, table))) return;
	const { rows } = await pool.query<{ hash: string }>(
		`select hash from ${quoteIdent(schema)}.${quoteIdent(table)}`,
	);
	const recorded = new Set(rows.map((row) => row.hash));
	const pending = SHIPPED_AUTH_CHAIN.filter((file) => !recorded.has(file.hash));
	if (pending.length > 0) {
		throw new AuthChainNotAppliedError(pending.map((file) => file.tag));
	}
};

/**
 * Verify the shipped auth chain is fully applied to the database behind `pool`.
 *
 * Returns the runner's status when it is, or `null` when the database has no
 * nk-auth journal table at all: a site that owns Better Auth's tables in its
 * own chain (a squashed baseline) never records this one, and that is not a
 * deployment mistake. Also `null` when this role cannot read the journal (a
 * least-privilege auth role with no access to the `drizzle` schema): it could
 * not have applied the chain either, so there is nothing to verify through it.
 * Throws {@link AuthChainNotAppliedError} when the journal exists but lags the
 * installed package.
 *
 * `createAuthHelpers` runs this once per process on the first session read
 * when the instance's `database` is a `pg` Pool; call it yourself from
 * `instrumentation.ts` or a health check to fail a deploy earlier.
 */
export const assertAuthChainApplied = async (
	pool: Pool,
	options: AuthChainCheckOptions = {},
): Promise<MigrationStatus | null> => {
	const { schema, table } = journalOf(options);
	if (!(await journalReadable(pool, schema, table))) return null;
	const status = await inspectMigrations({
		pool,
		migrationsFolder: authMigrationsFolder(),
		migrationsSchema: schema,
		migrationsTable: table,
	});
	if (status.pending.length > 0) {
		throw new AuthChainNotAppliedError(status.pending.map((file) => file.tag));
	}
	return status;
};

/**
 * The once-per-process form `createAuthHelpers` uses: resolves the pool off
 * the Better Auth options when there is one, memoizes the check, and rethrows
 * the same error on every later call so a failed deploy stays failed rather
 * than flapping. Anything that is not a `pg` Pool (a Drizzle or Kysely
 * adapter) is skipped: the check has nothing to query through.
 */
export const authChainCheck = (
	database: unknown,
	options: AuthChainCheckOptions = {},
): (() => Promise<void>) => {
	if (!isPool(database)) return async () => {};
	let checked: Promise<void> | undefined;
	return () => {
		checked ??= assertShippedChainRecorded(database, options);
		return checked;
	};
};
