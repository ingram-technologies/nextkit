// Migration runner with drift detection — the framework answer to two recurring
// pains with `drizzle-kit migrate`:
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
//
// This module is node-only (pg + fs + the drizzle migrator); it is NOT exported
// from the main entry, so a production bundle that only does runtime queries
// never pulls it. Reached via the "@ingram-tech/nk-db/migrate" subpath and the
// `nk-pg-migrate` bin.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Pool } from "pg";
import { type CreatePoolConfig, createPool } from "./pool.js";

/** One migration as recorded in `drizzle/meta/_journal.json` + its file hash. */
export interface MigrationFileMeta {
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
	const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
		entries: { idx: number; when: number; tag: string }[];
	};
	return journal.entries.map((entry) => {
		const sql = readFileSync(join(migrationsFolder, `${entry.tag}.sql`), "utf8");
		return {
			tag: entry.tag,
			hash: createHash("sha256").update(sql).digest("hex"),
			folderMillis: entry.when,
		};
	});
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
	/** Files drizzle's migrator would apply next (folderMillis > max recorded). */
	pending: MigrationFileMeta[];
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

/** Read the journal table; returns [] if it doesn't exist yet (fresh DB). */
const readRecorded = async (
	pool: Pool,
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
		if ((err as { code?: string }).code === "42P01") return [];
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
		const files = readJournal(folder);
		const recorded = await readRecorded(pool, schema, table);
		const drift = detectDrift(files, recorded);
		const maxRecorded = recorded.reduce((m, r) => Math.max(m, r.createdAt), 0);
		const pending = files.filter((f) => f.folderMillis > maxRecorded);
		return { files, recorded, pending, drifted: Boolean(drift), drift };
	} finally {
		await release();
	}
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

export interface MigrateResult {
	/** Tags of the migrations applied by this run (empty when up to date). */
	applied: string[];
}

/**
 * Apply pending migrations with the real drizzle-orm migrator. Runs a drift
 * pre-flight first and throws {@link MigrationDriftError} (not a confusing
 * `already exists`) when the journal is out of sync. Surfaces the actual
 * Postgres error on a failing statement.
 */
export const runMigrations = async (
	config: MigrateConfig = {},
): Promise<MigrateResult> => {
	const folder = config.migrationsFolder ?? DEFAULTS.migrationsFolder;
	const schema = config.migrationsSchema ?? DEFAULTS.migrationsSchema;
	const table = config.migrationsTable ?? DEFAULTS.migrationsTable;

	const status = await inspectMigrations(config);
	if (status.drifted) throw new MigrationDriftError(status);
	if (status.pending.length === 0) return { applied: [] };

	const { pool, release } = acquire(config);
	try {
		const { drizzle } = await import("drizzle-orm/node-postgres");
		const { migrate } = await import("drizzle-orm/node-postgres/migrator");
		await migrate(drizzle(pool), {
			migrationsFolder: folder,
			migrationsTable: table,
			migrationsSchema: schema,
		});
		return { applied: status.pending.map((m) => m.tag) };
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
