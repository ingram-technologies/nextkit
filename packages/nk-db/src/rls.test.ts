import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, withRlsTransaction } from "./drizzle.js";
import { isPgError } from "./errors.js";
import { encodeId, uuidv7 } from "./id.js";
import { createTestDb, type TestDb } from "./pglite/index.js";
import { createQueries, type PoolQueries } from "./queries.js";
import { resolveRlsConfig, rlsPreamble } from "./rls.js";

describe("resolveRlsConfig", () => {
	it("defaults role to authenticated and the GUC to request.jwt.claims", () => {
		// Pinned literally: these are the Supabase-compatible names existing
		// `auth.uid()` policies and role grants are written against.
		const config = resolveRlsConfig({ sub: "u1" });
		expect(config.role).toBe("authenticated");
		expect(config.claimsSetting).toBe("request.jwt.claims");
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

	it("decodes public ids in claims to their uuids, so auth.uid() policies hold", () => {
		const user = uuidv7();
		const org = uuidv7();
		const config = resolveRlsConfig({
			sub: encodeId(user, "usr"),
			org_id: encodeId(org, "org"),
			plan: "pro",
			nested: { id: encodeId(org, "org") },
		});
		expect(JSON.parse(config.claimsJson)).toEqual({
			sub: user,
			org_id: org,
			plan: "pro",
			// Only top-level string claims are normalised; nested shapes are the
			// site's own contract.
			nested: { id: encodeId(org, "org") },
		});
	});

	it("passes a raw uuid sub through unchanged", () => {
		const user = uuidv7();
		expect(JSON.parse(resolveRlsConfig({ sub: user }).claimsJson)).toEqual({
			sub: user,
		});
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
	it("binds the GUC name, claims, and role as values, never interpolating them", () => {
		const role = "x'; drop table notes; --";
		const claimsSetting = "app.claims'); select 1; --";
		const config = resolveRlsConfig(
			{ sub: "u1", note: `it's "quoted"` },
			{ role, claimsSetting },
		);
		const { text, values } = rlsPreamble(config);
		for (const hostile of [
			role,
			claimsSetting,
			config.claimsJson,
			"u1",
			"quoted",
		]) {
			expect(text).not.toContain(hostile);
		}
		expect(values).toEqual(
			expect.arrayContaining([role, claimsSetting, config.claimsJson]),
		);
		// One placeholder per bound value, so nothing is left to splice in.
		expect(text.match(/\$\d+/g)).toHaveLength(values.length);
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
				`);
			},
		});
		q = createQueries(testDb.pool);
	});

	// Every test starts from the same three rows, whatever the previous one wrote.
	beforeEach(async () => {
		await testDb.reset();
		await q.execute(
			"insert into notes (owner_id, body) values ($1, 'a-one'), ($1, 'a-two'), ($2, 'b-one')",
			[USER_A, USER_B],
		);
	});

	afterAll(async () => {
		await testDb.close();
	});

	const countAll = async (): Promise<string | undefined> =>
		(await q.query<{ count: string }>("select count(*) from notes"))[0]?.count;

	it("a plain query (privileged connection) bypasses RLS and sees all rows", async () => {
		expect(await countAll()).toBe("3");
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

	it("withRls accepts a public-id sub and decodes it before the policy sees it", async () => {
		const rows = await q.withRls({ sub: encodeId(USER_A, "usr") }, (tx) =>
			tx.query<{ body: string }>("select body from notes order by body"),
		);
		expect(rows.map((r) => r.body)).toEqual(["a-one", "a-two"]);
	});

	it("withRls resets role/claims after the transaction (no leak across pool checkouts)", async () => {
		await q.withRls({ sub: USER_A }, (tx) => tx.query("select 1"));
		// the very next plain query is privileged again
		expect(await countAll()).toBe("3");
	});

	it("withRls resets role/claims after a throwing callback too", async () => {
		await expect(
			q.withRls({ sub: USER_A }, async (tx) => {
				await tx.query("select 1");
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect(await countAll()).toBe("3");
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
		const aCount = await q.withRls({ sub: USER_A }, (tx) =>
			tx.one<{ count: string }>("select count(*) from notes"),
		);
		expect(aCount.count).toBe("2");
	});

	it("withRls rejects a write on another user's behalf (WITH CHECK)", async () => {
		const error = await q
			.withRls({ sub: USER_B }, (tx) =>
				tx.execute("insert into notes (owner_id, body) values ($1, 'forged')", [
					USER_A,
				]),
			)
			.catch((e: unknown) => e);
		// 42501 insufficient_privilege: "new row violates row-level security policy"
		expect(isPgError(error, "42501")).toBe(true);
		expect(await countAll()).toBe("3");
	});

	it("withRlsTransaction (Drizzle) scopes reads to the acting user", async () => {
		const db = createDb(testDb.pool, {});
		const aRows = await withRlsTransaction(db, { sub: USER_A }, (tx) =>
			tx.execute(sql`select body from notes order by body`),
		);
		expect(aRows.rows.map((r) => r.body)).toEqual(["a-one", "a-two"]);
	});
});
