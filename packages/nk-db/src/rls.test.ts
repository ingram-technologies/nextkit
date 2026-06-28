import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withRlsTransaction } from "./drizzle.js";
import { createTestDb, type TestDb } from "./pglite/index.js";
import { createQueries, type PoolQueries } from "./queries.js";
import {
	RLS_CLAIMS_SETTING,
	RLS_DEFAULT_ROLE,
	resolveRlsConfig,
	rlsPreamble,
} from "./rls.js";

describe("resolveRlsConfig", () => {
	it("defaults role to authenticated and the GUC to request.jwt.claims", () => {
		const config = resolveRlsConfig({ sub: "u1" });
		expect(config.role).toBe(RLS_DEFAULT_ROLE);
		expect(config.claimsSetting).toBe(RLS_CLAIMS_SETTING);
		expect(JSON.parse(config.claimsJson)).toEqual({ sub: "u1" });
	});

	it("takes role from the claim, then lets options override it", () => {
		expect(resolveRlsConfig({ sub: "u1", role: "service_role" }).role).toBe(
			"service_role",
		);
		expect(
			resolveRlsConfig({ sub: "u1", role: "service_role" }, { role: "app_user" })
				.role,
		).toBe("app_user");
	});

	it("serializes extra claims and honors a custom claims setting", () => {
		const config = resolveRlsConfig(
			{ sub: "u1", org_id: "o1" },
			{ claimsSetting: "app.claims" },
		);
		expect(config.claimsSetting).toBe("app.claims");
		expect(JSON.parse(config.claimsJson)).toEqual({ sub: "u1", org_id: "o1" });
	});
});

describe("rlsPreamble", () => {
	it("binds the GUC name, claims, and role (never interpolates)", () => {
		const { text, values } = rlsPreamble(resolveRlsConfig({ sub: "u1" }));
		expect(text).toBe(
			"select set_config($1, $2, true), set_config('role', $3, true)",
		);
		expect(values).toEqual([RLS_CLAIMS_SETTING, '{"sub":"u1"}', RLS_DEFAULT_ROLE]);
	});
});

// Real RLS enforcement against PGlite (Postgres 18). Two users own rows in a
// table whose policy keys off the JWT `sub` claim; the helpers must scope
// reads/writes to the acting user, while a plain (privileged) query sees
// everything.
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

describe("RLS enforcement on a direct connection", () => {
	let testDb: TestDb;
	let q: PoolQueries;

	beforeAll(async () => {
		testDb = await createTestDb({
			migrate: async (db) => {
				await db.exec(`
					create table notes (
						id uuid primary key default gen_random_uuid(),
						owner_id uuid not null,
						body text not null
					);
					alter table notes enable row level security;
					-- an auth.uid()-style policy, inlined so no auth schema is needed
					create policy notes_owner on notes
						using (
							owner_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
						)
						with check (
							owner_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
						);
					create role authenticated;
					grant select, insert, update, delete on notes to authenticated;
					insert into notes (owner_id, body) values
						('${USER_A}', 'a-one'),
						('${USER_A}', 'a-two'),
						('${USER_B}', 'b-one');
				`);
			},
		});
		q = createQueries(testDb.pool);
	});

	afterAll(async () => {
		await testDb.close();
	});

	it("a plain query (privileged connection) bypasses RLS and sees all rows", async () => {
		const all = await q.query<{ count: string }>("select count(*) from notes");
		expect(all[0]?.count).toBe("3");
	});

	it("withRls (raw helpers) scopes reads to the acting user", async () => {
		const aRows = await q.withRls({ sub: USER_A }, (tx) =>
			tx.query<{ body: string }>("select body from notes order by body"),
		);
		expect(aRows.map((r) => r.body)).toEqual(["a-one", "a-two"]);

		const bRows = await q.withRls({ sub: USER_B }, (tx) =>
			tx.query<{ body: string }>("select body from notes"),
		);
		expect(bRows.map((r) => r.body)).toEqual(["b-one"]);
	});

	it("withRls resets role/claims after the transaction (no leak across pool checkouts)", async () => {
		await q.withRls({ sub: USER_A }, (tx) => tx.query("select 1"));
		// the very next plain query is privileged again
		const all = await q.query<{ count: string }>("select count(*) from notes");
		expect(all[0]?.count).toBe("3");
	});

	it("withRls scopes a write — the inserted row belongs to the acting user", async () => {
		const inserted = await q.withRls({ sub: USER_B }, (tx) =>
			tx.one<{ owner_id: string }>(
				"insert into notes (owner_id, body) values ($1, 'b-two') returning owner_id",
				[USER_B],
			),
		);
		expect(inserted.owner_id).toBe(USER_B);
		// B now sees two rows; A still sees only its own
		const bCount = await q.withRls({ sub: USER_B }, (tx) =>
			tx.one<{ count: string }>("select count(*) from notes"),
		);
		expect(bCount.count).toBe("2");
	});

	it("withRlsTransaction (Drizzle) scopes reads to the acting user", async () => {
		const db = createDb(testDb.pool, {});
		const aRows = await withRlsTransaction(db, { sub: USER_A }, (tx) =>
			tx.execute(sql`select body from notes order by body`),
		);
		expect(aRows.rows.map((r) => r.body)).toEqual(["a-one", "a-two"]);
	});
});
