import { inspectMigrations, type MigrationStatus } from "@ingram-tech/nk-db/migrate";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

/** The migration chain this package ships (`migrations/` next to `dist/`). */
export const AUTH_MIGRATIONS_FOLDER: string = fileURLToPath(
	new URL("../migrations", import.meta.url),
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

/**
 * Verify the shipped auth chain is fully applied to the database behind `pool`.
 *
 * Returns the runner's status when it is, or `null` when the database has no
 * nk-auth journal table at all: a site that owns Better Auth's tables in its
 * own chain (a squashed baseline) never records this one, and that is not a
 * deployment mistake. Throws {@link AuthChainNotAppliedError} when the journal
 * exists but lags the installed package.
 *
 * `createAuthHelpers` runs this once per process on the first session read
 * when the instance's `database` is a `pg` Pool; call it yourself from
 * `instrumentation.ts` or a health check to fail a deploy earlier.
 */
export const assertAuthChainApplied = async (
	pool: Pool,
	options: AuthChainCheckOptions = {},
): Promise<MigrationStatus | null> => {
	const schema = options.migrationsSchema ?? "drizzle";
	const table = options.migrationsTable ?? AUTH_MIGRATIONS_TABLE;
	const { rows } = await pool.query<{ present: string | null }>(
		"select to_regclass($1) as present",
		[`"${schema}"."${table}"`],
	);
	if (rows[0]?.present === null || rows[0]?.present === undefined) return null;
	const status = await inspectMigrations({
		pool,
		migrationsFolder: AUTH_MIGRATIONS_FOLDER,
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
		checked ??= assertAuthChainApplied(database, options).then(() => undefined);
		return checked;
	};
};
