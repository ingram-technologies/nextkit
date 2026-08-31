import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { passkey } from "@better-auth/passkey";
import { runMigrations } from "@ingram-tech/nk-db/migrate";
import { createTestDb, type TestDb } from "@ingram-tech/nk-db/pglite";
import { getAuthTables } from "better-auth/db";
import { jwt } from "better-auth/plugins/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// nk-auth owns its auth tables as a shipped, journaled migration chain (see
// README § "Apply the schema"). This proves the chain a site actually applies is
// valid against PG18/PGlite and delivers its two hardening guarantees. It guards
// the failure modes that bit us wiring the chain up:
//   - a hand-written statement missing drizzle's breakpoint marker (PGlite parses
//     one statement per command, so an un-split file throws 42601), and
//   - the RLS / UUID-default hardening silently dropping out of a future delta.
// It is also the deploy gate for a better-auth bump: the "no drift" test below
// diffs the applied chain against the schema the pinned better-auth asks for,
// so a version that adds a column fails here, not in production.

const MIGRATIONS = fileURLToPath(new URL("../migrations", import.meta.url));
const JOURNAL_TABLE = "__nkauth_migrations";
const AUTH_TABLES = ["user", "session", "account", "verification", "jwks", "passkey"];

interface ColumnRow {
	table_name: string;
	column_name: string;
	is_nullable: "YES" | "NO";
}

const columnsOf = async (db: TestDb): Promise<ColumnRow[]> => {
	const { rows } = await db.pool.query<ColumnRow>(
		"select table_name, column_name, is_nullable from information_schema.columns where table_schema = 'public'",
	);
	return rows;
};

let db: TestDb;

beforeAll(async () => {
	// Apply the shipped chain as a dependency chain (its own journal table) — the
	// exact shape `nk dev` / a site's `db:migrate` uses. nk-auth has no app chain
	// of its own, so stub the primary applier out: left at its default it would
	// re-apply this same folder under drizzle's default journal table, which is
	// not the shape under test. (It previously passed a `migrationsTable` option
	// that does not exist on PgliteServerOptions and was silently ignored.)
	db = await createTestDb({
		migrate: async () => {},
		dependencyMigrations: [{ folder: MIGRATIONS, table: JOURNAL_TABLE }],
	});
});

afterAll(async () => {
	await db?.close();
});

describe("nk-auth migration chain", () => {
	it("applies cleanly and creates every Better Auth table", async () => {
		const { rows } = await db.pool.query<{ tablename: string }>(
			"select tablename from pg_tables where schemaname = 'public' order by tablename",
		);
		expect(rows.map((r) => r.tablename).sort()).toEqual([...AUTH_TABLES].sort());
	});

	it("has no drift from the schema the pinned better-auth expects", async () => {
		// The plugins whose tables the chain ships. A site adding another plugin
		// with tables (organization, two-factor, …) owns that schema itself.
		const expected = getAuthTables({ plugins: [jwt(), passkey()] });
		const columns = await columnsOf(db);
		const missing: string[] = [];
		const nullable: string[] = [];
		for (const table of Object.values(expected)) {
			for (const [name, field] of Object.entries(table.fields)) {
				const column = field.fieldName ?? name;
				const row = columns.find(
					(c) => c.table_name === table.modelName && c.column_name === column,
				);
				if (!row) missing.push(`${table.modelName}.${column}`);
				else if (field.required && row.is_nullable === "YES") {
					nullable.push(`${table.modelName}.${column}`);
				}
			}
		}
		// A hit here means better-auth changed its schema: ship the delta as the
		// next 000N file in migrations/ (never edit a shipped one).
		expect(missing, "columns better-auth expects but the chain lacks").toEqual([]);
		expect(
			nullable,
			"columns better-auth requires but the chain leaves nullable",
		).toEqual([]);
	});

	it("enables deny-all RLS on every auth table (hardening 2)", async () => {
		const { rows } = await db.pool.query<{
			tablename: string;
			rowsecurity: boolean;
		}>("select tablename, rowsecurity from pg_tables where schemaname = 'public'");
		for (const table of AUTH_TABLES) {
			const row = rows.find((r) => r.tablename === table);
			expect(row?.rowsecurity, `RLS on ${table}`).toBe(true);
		}
	});

	it("defaults a new user id to a UUID so auth.uid() RLS casts hold (hardening 1)", async () => {
		await db.pool.query(
			`insert into "user" ("name", "email") values ('a', 'a@acme.test')`,
		);
		const { rows } = await db.pool.query<{ id: string }>(`select id from "user"`);
		expect(rows[0]?.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
	});

	it("records the chain in its own journal table", async () => {
		const { rows } = await db.pool.query<{ n: string }>(
			`select count(*)::text as n from "drizzle"."${JOURNAL_TABLE}"`,
		);
		expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(2);
	});
});

// 0002 is the first delta a live site upgrades THROUGH: it lands on a database
// full of 1.6-era account rows with no `issuer`. These tests boot a database at
// 0001 only, seed pre-1.7 rows, then run the real `nk-pg-migrate` runner over
// the full chain — the exact path a site's `db:migrate` takes on deploy.
describe("0002_better_auth_1_7 on a pre-1.7 database", () => {
	let root: string;
	let baseline: string;

	const bootAt0001 = async (): Promise<TestDb> =>
		createTestDb({
			migrate: async () => {},
			dependencyMigrations: [{ folder: baseline, table: JOURNAL_TABLE }],
		});

	const seedAccount = async (
		at: TestDb,
		userId: string,
		providerId: string,
		accountId: string,
	): Promise<void> => {
		await at.pool.query(
			`insert into "account" ("id", "accountId", "providerId", "userId") values ($1, $2, $3, $4)`,
			[`acct-${providerId}-${accountId}`, accountId, providerId, userId],
		);
	};

	const seedUser = async (at: TestDb, email: string): Promise<string> => {
		const { rows } = await at.pool.query<{ id: string }>(
			`insert into "user" ("name", "email") values ('u', $1) returning id`,
			[email],
		);
		const id = rows[0]?.id;
		if (!id) throw new Error("seed user failed");
		return id;
	};

	const upgrade = (at: TestDb): ReturnType<typeof runMigrations> =>
		runMigrations({
			pool: at.pool,
			migrationsFolder: MIGRATIONS,
			migrationsTable: JOURNAL_TABLE,
		});

	beforeAll(() => {
		// A chain folder holding only the shipped 0001 (byte-identical, so the
		// runner's hash check sees the same applied file when the full chain runs).
		root = mkdtempSync(join(tmpdir(), "nkauth-0001-"));
		baseline = join(root, "migrations");
		mkdirSync(join(baseline, "meta"), { recursive: true });
		copyFileSync(
			join(MIGRATIONS, "0001_better_auth.sql"),
			join(baseline, "0001_better_auth.sql"),
		);
		writeFileSync(
			join(baseline, "meta", "_journal.json"),
			JSON.stringify({
				version: "7",
				dialect: "postgresql",
				entries: [
					{
						idx: 0,
						version: "7",
						when: 1735689600000,
						tag: "0001_better_auth",
						breakpoints: true,
					},
				],
			}),
		);
	});

	afterAll(() => {
		if (root) rmSync(root, { recursive: true, force: true });
	});

	it("backfills issuer with exactly what better-auth 1.7.2 writes for each provider", async () => {
		const at = await bootAt0001();
		try {
			const alice = await seedUser(at, "alice@acme.test");
			const bob = await seedUser(at, "bob@acme.test");
			await seedAccount(at, alice, "credential", alice);
			await seedAccount(at, alice, "google", "google-sub-1");
			await seedAccount(at, bob, "github", "gh-42");

			const result = await upgrade(at);
			expect(result.applied).toEqual(["0002_better_auth_1_7"]);

			const { rows } = await at.pool.query<{
				providerId: string;
				issuer: string;
			}>(`select "providerId", "issuer" from "account" order by "providerId"`);
			expect(rows).toEqual([
				{ providerId: "credential", issuer: "local:credential" },
				{ providerId: "github", issuer: "local:oauth:github" },
				{ providerId: "google", issuer: "https://accounts.google.com" },
			]);
			// The runner is idempotent: a second deploy is a no-op, not a re-run.
			expect((await upgrade(at)).applied).toEqual([]);
		} finally {
			await at.close();
		}
	});

	it("refuses to guess an issuer it cannot derive, naming the provider", async () => {
		const at = await bootAt0001();
		try {
			const carol = await seedUser(at, "carol@acme.test");
			await seedAccount(at, carol, "credential", carol);
			// microsoft's issuer is the token's per-tenant `iss` — not derivable.
			await seedAccount(at, carol, "microsoft", "ms-1");

			// drizzle wraps the Postgres error ("Failed query: …") and keeps the
			// `raise` text on `cause`, which is what `nk-pg-migrate` prints.
			const failure = await upgrade(at).then(
				() => null,
				(error: unknown) => error,
			);
			expect(failure).toBeInstanceOf(Error);
			const cause =
				failure instanceof Error ? (failure.cause ?? failure) : failure;
			expect(cause).toBeInstanceOf(Error);
			expect(cause instanceof Error ? cause.message : "").toMatch(
				/cannot derive account\.issuer for providerId\(s\): microsoft/,
			);
			// Rolled back: nothing applied, the known row was not half-migrated.
			const columns = await columnsOf(at);
			expect(columns.some((c) => c.column_name === "issuer")).toBe(false);
		} finally {
			await at.close();
		}
	});
});
