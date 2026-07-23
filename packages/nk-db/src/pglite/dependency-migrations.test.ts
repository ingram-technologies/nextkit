import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./index.js";

// `dependencyMigrations` is the generic primitive nk-auth's chain rides on: an
// extra journaled chain applied BEFORE the app's own migrations, on its own
// journal table. This proves the ordering (an app table can FK a dependency
// table) and the journal isolation (two chains, two tables) without dragging in
// nk-auth — the harness must stay package-agnostic.

interface Mig {
	tag: string;
	when: number;
	sql: string;
}

const writeChain = (dir: string, migs: Mig[]): void => {
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

let testDb: TestDb;
let root: string;

beforeAll(async () => {
	root = mkdtempSync(join(tmpdir(), "nkdb-depmig-"));
	const depFolder = join(root, "auth");
	const appFolder = join(root, "drizzle");
	// Dependency chain owns "parent"; the app chain FK-references it. If the app
	// chain ran first (or the dep chain not at all) this migration would fail.
	writeChain(depFolder, [
		{
			tag: "0001_parent",
			when: 1000,
			sql: 'create table "parent" (id int primary key);',
		},
	]);
	writeChain(appFolder, [
		{
			tag: "0001_child",
			when: 1000,
			sql: 'create table "child" (id int primary key, parent_id int not null references "parent" (id));',
		},
	]);
	testDb = await createTestDb({
		migrationsFolder: appFolder,
		dependencyMigrations: [{ folder: depFolder, table: "__dep_migrations" }],
	});
});

afterAll(async () => {
	await testDb?.close();
	if (root) rmSync(root, { recursive: true, force: true });
});

describe("dependencyMigrations", () => {
	it("applies the dependency chain before the app chain, so cross-chain FKs resolve", async () => {
		await testDb.pool.query('insert into "parent" (id) values (1)');
		await testDb.pool.query('insert into "child" (id, parent_id) values (1, 1)');
		const { rows } = await testDb.pool.query<{ n: string }>(
			'select count(*)::text as n from "child"',
		);
		expect(rows[0]?.n).toBe("1");
	});

	it("journals each chain in its own table", async () => {
		const dep = await testDb.pool.query<{ n: string }>(
			'select count(*)::text as n from "drizzle"."__dep_migrations"',
		);
		const app = await testDb.pool.query<{ n: string }>(
			'select count(*)::text as n from "drizzle"."__drizzle_migrations"',
		);
		expect(dep.rows[0]?.n).toBe("1");
		expect(app.rows[0]?.n).toBe("1");
	});
});
