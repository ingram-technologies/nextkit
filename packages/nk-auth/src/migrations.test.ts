import { fileURLToPath } from "node:url";
import { createTestDb, type TestDb } from "@ingram-tech/nk-db/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// nk-auth owns its auth tables as a shipped, journaled migration chain (see
// README § "Apply the schema"). This proves the chain a site actually applies is
// valid against PG18/PGlite and delivers its two hardening guarantees. It guards
// the failure modes that bit us wiring the chain up:
//   - a hand-written statement missing drizzle's breakpoint marker (PGlite parses
//     one statement per command, so an un-split file throws 42601), and
//   - the RLS / UUID-default hardening silently dropping out of a future delta.

const MIGRATIONS = fileURLToPath(new URL("../migrations", import.meta.url));
const AUTH_TABLES = ["user", "session", "account", "verification", "jwks", "passkey"];

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
		dependencyMigrations: [{ folder: MIGRATIONS, table: "__nkauth_migrations" }],
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
			`select count(*)::text as n from "drizzle"."__nkauth_migrations"`,
		);
		expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(1);
	});
});
