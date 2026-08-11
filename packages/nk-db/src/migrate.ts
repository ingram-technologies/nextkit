// Migration runner with drift detection — the framework answer to three
// recurring pains with `drizzle-kit migrate`:
//
//   1. It swallows the real database error and exits 1 opaquely ("applying
//      migrations..." then nothing). {@link runMigrations} uses drizzle-orm's
//      own migrator, so a failing statement throws the actual Postgres error.
//   2. When a DB's migration journal drifts from the `drizzle/` files — the
//      classic "built via db:push, or the 0000 baseline was regenerated" case —
//      the migrator blindly replays 0000 and dies with a confusing
//      `relation "..." already exists`. {@link runMigrations} runs a pre-flight
//      {@link inspectMigrations} check and throws a {@link MigrationDriftError}
//      that explains exactly what happened and how to fix it, and
//      {@link baselineMigrations} reconciles a journal whose schema is already
//      correct without re-running any DDL.
//   3. It decides what to apply by `when > max(created_at)`, so a migration
//      whose journal timestamp lands below an already-applied one is skipped
//      **silently, permanently, and reported as success**. {@link runMigrations}
//      computes pending as a set difference on hash instead, and throws a
//      {@link MigrationOrderError} rather than under-applying.
//
// This module is node-only (pg + fs + the drizzle migrator); it is NOT exported
// from the main entry, so a production bundle that only does runtime queries
// never pulls it. Reached via the "@ingram-tech/nk-db/migrate" subpath and the
// `nk-pg-migrate` bin.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Pool } from "pg";
import { z } from "zod";
import { isPgError } from "./errors.js";
import { type CreatePoolConfig, createPool } from "./pool.js";

/** One migration as recorded in `drizzle/meta/_journal.json` + its file hash. */
export interface MigrationFileMeta {
	/** Journal position. */
	idx: number;
	/** Journal tag, e.g. `0003_illegal_jack_flag`. */
	tag: string;
	/** `sha256(fileContents)` — the exact value drizzle records, so our journal
	 *  rows are byte-compatible with `drizzle-kit migrate`. */
	hash: string;
	/** The journal entry's `when` (ms epoch) — drizzle's `created_at`. */
	folderMillis: number;
}

export interface MigrationsLocation {
	/** Drizzle migrations folder. Default `drizzle`. */
	migrationsFolder?: string;
	/** Journal table name. Default `__drizzle_migrations`. */
	migrationsTable?: string;
	/** Journal table schema. Default `drizzle`. */
	migrationsSchema?: string;
}

export type MigrateConfig = CreatePoolConfig &
	MigrationsLocation & {
		/** Reuse an existing pool instead of creating one from the connection
		 *  string. The caller owns its lifecycle — it is not ended here. Pass your
		 *  app's shared pool to avoid opening a second connection. */
		pool?: Pool;
	};

/** Resolve the pool to use: a caller-supplied one (left open) or a fresh one we
 *  own (ended on release). */
const acquire = (
	config: MigrateConfig,
): { pool: Pool; release: () => Promise<void> } => {
	if (config.pool) return { pool: config.pool, release: async () => {} };
	const pool = createPool(config);
	return { pool, release: () => pool.end() };
};

const DEFAULTS = {
	migrationsFolder: "drizzle",
	migrationsTable: "__drizzle_migrations",
	migrationsSchema: "drizzle",
} as const;

const journalSchema = z.object({
	entries: z.array(z.object({ idx: z.number(), when: z.number(), tag: z.string() })),
});

/**
 * Read `meta/_journal.json` + each `.sql` and compute the per-file hash the same
 * way drizzle does (`sha256` of the raw file). Decoupled from drizzle's internal
 * `readMigrationFiles` so we also keep the human-readable tag.
 */
export const readJournal = (
	migrationsFolder: string = DEFAULTS.migrationsFolder,
): MigrationFileMeta[] => {
	const journalPath = join(migrationsFolder, "meta", "_journal.json");
	if (!existsSync(journalPath)) {
		throw new Error(`@ingram-tech/nk-db: no migration journal at ${journalPath}`);
	}
	const journal = journalSchema.parse(JSON.parse(readFileSync(journalPath, "utf8")));
	return journal.entries.map((entry) => {
		const sql = readFileSync(join(migrationsFolder, `${entry.tag}.sql`), "utf8");
		return {
			idx: entry.idx,
			tag: entry.tag,
			hash: createHash("sha256").update(sql).digest("hex"),
			folderMillis: entry.when,
		};
	});
};

/**
 * Journal integrity, checked on the files alone.
 *
 * Both properties the migrator silently depends on: drizzle decides what to
 * apply by comparing `when` against the newest recorded `created_at` with a
 * strict `>`, so a `when` that doesn't strictly increase down the journal marks
 * a migration the migrator can never reach (see {@link MigrationOrderError}),
 * and a gap or repeat in `idx` means the journal was hand-edited or merged
 * badly and no longer describes one ordered chain.
 */
const journalIssues = (files: MigrationFileMeta[]): string[] => {
	const issues: string[] = [];
	for (let i = 1; i < files.length; i++) {
		const prev = files[i - 1];
		const cur = files[i];
		if (!prev || !cur) continue;
		if (cur.folderMillis <= prev.folderMillis) {
			issues.push(
				`${cur.tag} has when=${cur.folderMillis}, not after ${prev.tag}'s ${prev.folderMillis}`,
			);
		}
	}
	files.forEach((f, i) => {
		if (f.idx !== i)
			issues.push(`${f.tag} has idx=${f.idx} at journal position ${i}`);
	});
	return issues;
};

/** A row of the drizzle journal table. */
export interface RecordedMigration {
	hash: string;
	createdAt: number;
}

export interface MigrationStatus {
	/** All journal files, in order. */
	files: MigrationFileMeta[];
	/** Rows already in the journal table, oldest first. */
	recorded: RecordedMigration[];
	/** Files whose hash is not yet in the journal table — everything still to
	 *  apply, by set difference rather than by timestamp (see {@link unreachable}). */
	pending: MigrationFileMeta[];
	/** Pending files drizzle's migrator will never apply because their `when`
	 *  doesn't beat the newest recorded `created_at`. Empty on a healthy chain. */
	unreachable: MigrationFileMeta[];
	/** Ordering defects in `meta/_journal.json` itself (non-increasing `when`,
	 *  gaps or repeats in `idx`). */
	journalIssues: string[];
	/** True when the journal table doesn't line up with the files (see {@link drift}). */
	drifted: boolean;
	drift?: MigrationDrift;
}

export interface MigrationDrift {
	reason: string;
	/** Recorded hashes that match no current file (the regenerated-baseline tell). */
	recordedNotInFiles: string[];
}

const qualified = (schema: string, table: string): string =>
	`"${schema.replace(/"/g, '""')}"."${table.replace(/"/g, '""')}"`;

/** The `.query` surface shared by `Pool` and a checked-out `PoolClient`, so the
 *  inspect path can run over the advisory-lock client in {@link runMigrations}. */
type Queryable = Pick<Pool, "query">;

/** Read the journal table; returns [] if it doesn't exist yet (fresh DB). */
const readRecorded = async (
	pool: Queryable,
	schema: string,
	table: string,
): Promise<RecordedMigration[]> => {
	try {
		const { rows } = await pool.query<{ hash: string; created_at: string }>(
			`select hash, created_at from ${qualified(schema, table)} order by created_at asc`,
		);
		// created_at is bigint → pg returns it as a string; coerce to number (ms
		// epochs fit safely in a JS number).
		return rows.map((r) => ({ hash: r.hash, createdAt: Number(r.created_at) }));
	} catch (err) {
		// 42P01 = undefined_table → never migrated; not an error.
		if (isPgError(err, "42P01")) return [];
		throw err;
	}
};

const detectDrift = (
	files: MigrationFileMeta[],
	recorded: RecordedMigration[],
): MigrationDrift | undefined => {
	const fileHashes = new Set(files.map((f) => f.hash));
	const recordedNotInFiles = recorded
		.map((r) => r.hash)
		.filter((h) => !fileHashes.has(h));

	if (recorded.length > files.length) {
		return {
			reason: `the journal table has ${recorded.length} recorded migration(s) but only ${files.length} file(s) exist`,
			recordedNotInFiles,
		};
	}
	// A healthy journal is exactly the first N files, in order, by hash.
	for (let i = 0; i < recorded.length; i++) {
		if (recorded[i]?.hash !== files[i]?.hash) {
			return {
				reason:
					recordedNotInFiles.length > 0
						? `recorded migration #${i + 1} matches no current file — the baseline was likely regenerated, or the schema was built with db:push`
						: `recorded migration #${i + 1} doesn't match file ${files[i]?.tag} (a migration file changed after it was applied)`,
				recordedNotInFiles,
			};
		}
	}
	return undefined;
};

/**
 * Compare the DB's migration journal to the `drizzle/` files without changing
 * anything. The basis for {@link runMigrations}'s pre-flight; also useful on its
 * own (a `--status` check).
 */
export const inspectMigrations = async (
	config: MigrateConfig = {},
): Promise<MigrationStatus> => {
	const folder = config.migrationsFolder ?? DEFAULTS.migrationsFolder;
	const schema = config.migrationsSchema ?? DEFAULTS.migrationsSchema;
	const table = config.migrationsTable ?? DEFAULTS.migrationsTable;
	const { pool, release } = acquire(config);
	try {
		return await inspectWith(pool, folder, schema, table);
	} finally {
		await release();
	}
};

const inspectWith = async (
	db: Queryable,
	folder: string,
	schema: string,
	table: string,
): Promise<MigrationStatus> => {
	const files = readJournal(folder);
	const recorded = await readRecorded(db, schema, table);
	const drift = detectDrift(files, recorded);
	// Pending is a set difference on hash, NOT `folderMillis > max(created_at)`.
	// The high-water mark is how drizzle's own migrator decides, and it is why
	// `unreachable` has to be computed separately: a file below the mark whose
	// hash was never recorded is not pending-and-waiting, it is pending-forever.
	const appliedHashes = new Set(recorded.map((r) => r.hash));
	const pending = files.filter((f) => !appliedHashes.has(f.hash));
	const maxRecorded = recorded.reduce((m, r) => Math.max(m, r.createdAt), 0);
	const unreachable =
		recorded.length > 0 ? pending.filter((f) => f.folderMillis <= maxRecorded) : [];
	return {
		files,
		recorded,
		pending,
		unreachable,
		journalIssues: journalIssues(files),
		drifted: Boolean(drift),
		drift,
	};
};

/** Thrown by {@link runMigrations} when the journal is out of sync with the
 *  files — applying would replay already-present DDL and fail confusingly. */
export class MigrationDriftError extends Error {
	readonly status: MigrationStatus;
	constructor(status: MigrationStatus) {
		const d = status.drift;
		super(
			[
				`migration journal drift: ${d?.reason ?? "journal does not match files"}.`,
				d?.recordedNotInFiles.length
					? `  Recorded hashes matching no file: ${d.recordedNotInFiles.map((h) => h.slice(0, 12)).join(", ")}.`
					: "",
				"  Fix: if this DB's schema already matches the files (e.g. built via db:push, or after regenerating the baseline), reconcile the journal with `baselineMigrations()` / `nk-pg-migrate --baseline` — it records the current file chain WITHOUT re-running DDL. Otherwise rebuild the database.",
			]
				.filter(Boolean)
				.join("\n"),
		);
		this.name = "MigrationDriftError";
		this.status = status;
	}
}

/**
 * Thrown by {@link runMigrations} when the chain contains a migration the
 * migrator would skip **silently and permanently**.
 *
 * drizzle's migrator applies exactly the files whose journal `when` is greater
 * than the newest `created_at` in the journal table. A file below that mark
 * that was never recorded — two branches generating migrations and merging in
 * the other order, or a hand-edited `when` — is not applied, is not recorded,
 * and is not drift: the recorded rows still match the files positionally, so
 * the pre-flight passes and the run reports success having done nothing. The
 * gap then persists for the life of the database.
 *
 * The fix is to renumber the stranded entry's `when` in `meta/_journal.json`
 * past the newest applied migration. That edits the journal, not the `.sql`, so
 * the file's hash — the thing every database recorded and `nk migrations`
 * seals — is untouched.
 */
export class MigrationOrderError extends Error {
	readonly status: MigrationStatus;
	constructor(status: MigrationStatus) {
		const stranded = status.unreachable.map(
			(m) => `${m.tag} (when=${m.folderMillis})`,
		);
		const newest = status.recorded.reduce((m, r) => Math.max(m, r.createdAt), 0);
		super(
			[
				`migration ordering: ${status.unreachable.length} unapplied migration(s) sit at or below the newest applied timestamp (${newest}), so the migrator would skip them and report success:`,
				`  ${stranded.join("\n  ")}`,
				status.journalIssues.length
					? `  Journal defects: ${status.journalIssues.join("; ")}.`
					: "",
				`  Fix: raise each stranded entry's "when" in meta/_journal.json above ${newest} (and keep the journal's "when" values strictly increasing). That changes the journal, not the .sql — the file hash every database recorded stays the same.`,
			]
				.filter(Boolean)
				.join("\n"),
		);
		this.name = "MigrationOrderError";
		this.status = status;
	}
}

export interface MigrateResult {
	/** Tags of the migrations applied by this run (empty when up to date). */
	applied: string[];
}

// Advisory-lock identity for the migration runner (two arbitrary-but-stable
// int32s, `classid`/`objid`). Session-scoped on the client that runs the whole
// migration, so a crashed runner releases it with its connection.
const MIGRATE_LOCK_CLASS = 0x6e6b_6462; // "nkdb"
const MIGRATE_LOCK_ID = 1;

/**
 * Apply pending migrations with the real drizzle-orm migrator. Runs a drift
 * pre-flight first and throws {@link MigrationDriftError} (not a confusing
 * `already exists`) when the journal is out of sync, and a
 * {@link MigrationOrderError} when the chain contains a migration the migrator
 * would skip silently. Surfaces the actual Postgres error on a failing
 * statement.
 *
 * Concurrency-safe: the whole run (pre-flight + migrate) happens on one client
 * holding `pg_advisory_lock`, because drizzle's migrator takes no lock of its
 * own — two concurrent deploys would otherwise both see the same pending set,
 * double-apply it, and leave duplicate journal rows (i.e. permanent drift).
 * The second runner blocks on the lock, then sees an up-to-date journal and
 * no-ops. Everything runs on that single client (not the pool) so a `max: 1`
 * pool — the local PGlite case — can't deadlock against the lock holder.
 */
export const runMigrations = async (
	config: MigrateConfig = {},
): Promise<MigrateResult> => {
	const folder = config.migrationsFolder ?? DEFAULTS.migrationsFolder;
	const schema = config.migrationsSchema ?? DEFAULTS.migrationsSchema;
	const table = config.migrationsTable ?? DEFAULTS.migrationsTable;

	const { pool, release } = acquire(config);
	try {
		const client = await pool.connect();
		try {
			await client.query("select pg_advisory_lock($1, $2)", [
				MIGRATE_LOCK_CLASS,
				MIGRATE_LOCK_ID,
			]);
			const status = await inspectWith(client, folder, schema, table);
			if (status.drifted) throw new MigrationDriftError(status);
			// Refuse rather than silently under-apply: drizzle's migrator would
			// skip these and report success. See {@link MigrationOrderError}.
			if (status.unreachable.length > 0) throw new MigrationOrderError(status);
			if (status.pending.length === 0) return { applied: [] };

			const { drizzle } = await import("drizzle-orm/node-postgres");
			const { migrate } = await import("drizzle-orm/node-postgres/migrator");
			await migrate(drizzle(client), {
				migrationsFolder: folder,
				migrationsTable: table,
				migrationsSchema: schema,
			});
			return { applied: status.pending.map((m) => m.tag) };
		} finally {
			await client
				.query("select pg_advisory_unlock($1, $2)", [
					MIGRATE_LOCK_CLASS,
					MIGRATE_LOCK_ID,
				])
				.catch(() => {});
			client.release();
		}
	} finally {
		await release();
	}
};

/**
 * Reconcile a journal whose schema is ALREADY correct but whose
 * `__drizzle_migrations` rows don't match the files (built via db:push, or after
 * regenerating the baseline). Records the full current file chain as applied —
 * hashes + `when` timestamps, byte-compatible with drizzle — WITHOUT running any
 * migration DDL, so a subsequent `runMigrations` is a clean no-op.
 *
 * Only call this when you've confirmed the live schema matches the migration
 * files; it does not verify that.
 */
export const baselineMigrations = async (
	config: MigrateConfig = {},
): Promise<{ recorded: string[] }> => {
	const folder = config.migrationsFolder ?? DEFAULTS.migrationsFolder;
	const schema = config.migrationsSchema ?? DEFAULTS.migrationsSchema;
	const table = config.migrationsTable ?? DEFAULTS.migrationsTable;
	const files = readJournal(folder);
	const { pool, release } = acquire(config);
	const client = await pool.connect();
	try {
		await client.query("begin");
		await client.query(
			`create schema if not exists "${schema.replace(/"/g, '""')}"`,
		);
		await client.query(
			`create table if not exists ${qualified(schema, table)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at bigint
			)`,
		);
		await client.query(`delete from ${qualified(schema, table)}`);
		for (const f of files) {
			await client.query(
				`insert into ${qualified(schema, table)} ("hash", "created_at") values ($1, $2)`,
				[f.hash, f.folderMillis],
			);
		}
		await client.query("commit");
		return { recorded: files.map((f) => f.tag) };
	} catch (err) {
		await client.query("rollback").catch(() => {});
		throw err;
	} finally {
		client.release();
		await release();
	}
};
