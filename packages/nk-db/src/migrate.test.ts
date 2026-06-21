import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	baselineMigrations,
	inspectMigrations,
	MigrationDriftError,
	readJournal,
	runMigrations,
} from "./migrate.js";
import { createPgliteServer, type PgliteServer } from "./pglite/index.js";

interface Mig {
	tag: string;
	when: number;
	sql: string;
}

const writeMigrations = (dir: string, migs: Mig[]): void => {
	mkdirSync(join(dir, "meta"), { recursive: true });
	writeFileSync(
		join(dir, "meta", "_journal.json"),
		JSON.stringify({
			version: "7",
			dialect: "postgresql",
			entries: migs.map((m, idx) => ({
				idx,
				version: "7",
				when: m.when,
				tag: m.tag,
				breakpoints: true,
			})),
		}),
	);
	for (const m of migs) writeFileSync(join(dir, `${m.tag}.sql`), m.sql);
};

const freePort = (): Promise<number> =>
	new Promise((resolve, reject) => {
		const srv = createServer();
		srv.once("error", reject);
		srv.listen(0, "127.0.0.1", () => {
			const addr = srv.address();
			const port = typeof addr === "object" && addr ? addr.port : 0;
			srv.close((err) => (err ? reject(err) : resolve(port)));
		});
	});

let server: PgliteServer;
let pool: Pool;
let dir: string;
let cfg: { pool: Pool; migrationsFolder: string };

// One shared pool (max:1) for the file, passed to the migrate functions too.
const q = async <R extends Record<string, unknown>>(
	sql: string,
	params?: unknown[],
): Promise<R[]> => {
	const { rows } = await pool.query<R>(sql, params);
	return rows;
};

// The PGlite socket server is reliable as exactly one instance + one connection
// for the file's lifetime (repeated WASM instances and connection churn both
// destabilise it). So the suite shares ONE pool, and only the apply test invokes
// drizzle's migrator — the drift and baseline tests deliberately exercise paths
// that don't (drift throws in pre-flight; baseline + no-op short-circuits before
// migrate()). Plain SQL on the shared connection between tests is fine.
beforeAll(async () => {
	dir = mkdtempSync(join(tmpdir(), "nk-migrate-"));
	writeMigrations(dir, [
		{ tag: "0000_a", when: 1000, sql: "CREATE TABLE a (id int primary key);" },
		{ tag: "0001_b", when: 2000, sql: "CREATE TABLE b (id int primary key);" },
	]);
	const port = await freePort();
	server = await createPgliteServer({ port, migrate: async () => {} });
	pool = new Pool({ connectionString: server.databaseUrl, max: 1 });
	cfg = { pool, migrationsFolder: dir };
});

afterAll(async () => {
	await pool.end();
	await server.stop();
	rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
	await q("drop table if exists a, b cascade");
	await q("drop schema if exists drizzle cascade");
});

const tables = async (): Promise<string[]> => {
	const rows = await q<{ tablename: string }>(
		"select tablename from pg_tables where schemaname='public' and tablename in ('a','b') order by 1",
	);
	return rows.map((r) => r.tablename);
};

describe("readJournal", () => {
	it("reads tags + stable sha256 hashes from the journal", () => {
		const metas = readJournal(dir);
		expect(metas.map((m) => m.tag)).toEqual(["0000_a", "0001_b"]);
		expect(metas[0]?.hash).toMatch(/^[0-9a-f]{64}$/);
		expect(metas[0]?.folderMillis).toBe(1000);
		expect(readJournal(dir)[0]?.hash).toBe(metas[0]?.hash);
	});
});

describe("runMigrations", () => {
	it("applies pending on a fresh db, records the journal, then is a clean no-op", async () => {
		const first = await runMigrations(cfg);
		expect(first.applied).toEqual(["0000_a", "0001_b"]);
		expect(await tables()).toEqual(["a", "b"]);

		// Second call: nothing pending → returns early (no migrator re-run).
		const second = await runMigrations(cfg);
		expect(second.applied).toEqual([]);
		expect(await tables()).toEqual(["a", "b"]);

		const status = await inspectMigrations(cfg);
		expect(status.drifted).toBe(false);
		expect(status.pending).toEqual([]);
		expect(status.recorded).toHaveLength(2);
	});
});

describe("drift detection", () => {
	it("flags a journal whose recorded hashes match no file, and refuses to migrate", async () => {
		// Simulate a regenerated baseline: rows recorded with stale/wrong hashes.
		await q('create schema "drizzle"');
		await q(
			'create table "drizzle"."__drizzle_migrations" (id serial primary key, hash text not null, created_at bigint)',
		);
		await q(
			'insert into "drizzle"."__drizzle_migrations" (hash, created_at) values ($1,$2),($3,$4)',
			["deadbeef".repeat(8), 500, "feedface".repeat(8), 600],
		);

		const status = await inspectMigrations(cfg);
		expect(status.drifted).toBe(true);
		expect(status.drift?.recordedNotInFiles).toHaveLength(2);

		await expect(runMigrations(cfg)).rejects.toBeInstanceOf(MigrationDriftError);
	});
});

describe("baselineMigrations", () => {
	it("records the file chain without running DDL, making runMigrations a no-op", async () => {
		// Schema already correct (built out-of-band, e.g. db:push), journal empty.
		await q("create table a (id int primary key)");
		await q("create table b (id int primary key)");

		const { recorded } = await baselineMigrations(cfg);
		expect(recorded).toEqual(["0000_a", "0001_b"]);

		const status = await inspectMigrations(cfg);
		expect(status.drifted).toBe(false);
		expect(status.pending).toEqual([]);

		// No DDL re-run → still a clean no-op, no "already exists".
		const result = await runMigrations(cfg);
		expect(result.applied).toEqual([]);
	});
});
