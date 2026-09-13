import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	diffFingerprints,
	type Fingerprint,
	fingerprintChain,
	fingerprintDatabase,
	formatFingerprintDiff,
} from "./fingerprint.js";
import { createPgliteServer, type PgliteServer } from "./pglite/index.js";

// A chain carrying the object kinds drizzle's snapshot cannot model: a role
// grant, a function, a trigger, a policy, a view owned by another role. The
// fingerprint must see all of them, and a set-wise diff must name exactly
// what changed between two chains.
const writeChain = (dir: string, files: Record<string, string>): void => {
	mkdirSync(join(dir, "meta"), { recursive: true });
	const tags = Object.keys(files);
	writeFileSync(
		join(dir, "meta", "_journal.json"),
		JSON.stringify({
			version: "7",
			dialect: "postgresql",
			entries: tags.map((tag, idx) => ({
				idx,
				version: "7",
				when: 1735689600000 + idx,
				tag,
				breakpoints: true,
			})),
		}),
	);
	for (const [tag, sql] of Object.entries(files))
		writeFileSync(join(dir, `${tag}.sql`), sql);
};

const BASE = `
do $$ begin
	if not exists (select from pg_roles where rolname = 'reader') then create role reader nologin; end if;
end $$;
create table widgets (id int primary key, name text not null, price numeric(10,2) default 0);
alter table widgets enable row level security;
create policy widgets_read on widgets for select to reader using (true);
create function widget_count() returns bigint language sql stable as $$ select count(*) from widgets $$;
create function touch() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger widgets_touch before update on widgets for each row execute function touch();
grant reader to current_user;
grant usage, create on schema public to reader;
set local role reader;
create view widget_names as select name from widgets;
reset role;
grant select on widgets to reader;
`;

describe("fingerprint", () => {
	let root: string;
	let chainA: string;
	let chainB: string;
	let a: Fingerprint;

	beforeAll(async () => {
		root = mkdtempSync(join(tmpdir(), "nkdb-fingerprint-"));
		chainA = join(root, "a");
		chainB = join(root, "b");
		// The same schema built in one file and in two (a squash and its chain).
		writeChain(chainA, { "0000_baseline": BASE });
		writeChain(chainB, {
			"0000_init": BASE.replace(
				"price numeric(10,2) default 0",
				"price numeric(10,2)",
			),
			"0001_default": "alter table widgets alter column price set default 0;",
		});
		a = await fingerprintChain({ migrationsFolder: chainA, roles: ["reader"] });
	}, 60_000);

	afterAll(() => rmSync(root, { recursive: true, force: true }));

	it("covers what the drizzle snapshot cannot model", () => {
		expect(a.policies).toHaveLength(1);
		expect(a.triggers).toHaveLength(1);
		expect(
			(a.functions ?? []).map((f) => (f as { name: string }).name).sort(),
		).toEqual(["touch", "widget_count"]);
		expect(a.relowners).toContainEqual({
			rel: "public.widget_names",
			kind: "v",
			owner: "reader",
			options: "",
		});
		expect(a.table_grants).toContainEqual({
			table_schema: "public",
			table_name: "widgets",
			grantee: "reader",
			privilege_type: "SELECT",
		});
		expect(a.rls).toContainEqual({
			rel: "public.widgets",
			enabled: true,
			forced: false,
		});
	});

	it("is identical for a squashed chain and the chain it squashed", async () => {
		const b = await fingerprintChain({
			migrationsFolder: chainB,
			roles: ["reader"],
		});
		expect(diffFingerprints(a, b)).toEqual([]);
	});

	it("names exactly what differs, set-wise", async () => {
		const chainC = join(root, "c");
		writeChain(chainC, {
			"0000_baseline": BASE.replace("name text not null", "name text"),
			"0001_more": "create index widgets_name_idx on widgets (name);",
		});
		const c = await fingerprintChain({
			migrationsFolder: chainC,
			roles: ["reader"],
		});
		const differences = diffFingerprints(a, c);
		// PG18 keeps NOT NULL in pg_constraint, so the dropped one shows there too.
		expect(differences.map((d) => d.key)).toEqual([
			"columns",
			"constraints",
			"indexes",
		]);
		expect(differences[0]?.onlyA[0]).toContain('"notnull":true');
		expect(differences[2]?.onlyB[0]).toContain("widgets_name_idx");
		expect(formatFingerprintDiff(differences)).toMatch(/TOTAL DIFFS 4$/);
	});

	it("applies dependency chains first and pre-chain SQL before them", async () => {
		const dep = join(root, "dep");
		writeChain(dep, { "0000_dep": "create table dep_table (id int primary key);" });
		const main = join(root, "main");
		writeChain(main, {
			"0000_main":
				"create table main_table (id int primary key, dep_id int references dep_table(id), v pre_type);",
		});
		const fp = await fingerprintChain({
			migrationsFolder: main,
			dependencyMigrations: [dep],
			pre: ["create domain pre_type as text"],
		});
		expect(
			(fp.constraints ?? []).some(
				(c) => (c as { name: string }).name === "main_table_dep_id_fkey",
			),
		).toBe(true);
		expect(
			(fp.columns ?? []).some(
				(c) =>
					(c as { col: string; type: string }).col === "v" &&
					(c as { type: string }).type === "pre_type",
			),
		).toBe(true);
	});

	describe("against a live database", () => {
		let server: PgliteServer;
		beforeAll(async () => {
			server = await createPgliteServer({
				migrate: async (db) => {
					await db.exec(`set search_path to public;\n${BASE}`);
				},
				id758: false,
			});
		}, 60_000);
		afterAll(() => server.stop());

		it("reads the same fingerprint over a connection", async () => {
			const live = await fingerprintDatabase({
				connectionString: server.databaseUrl,
				roles: ["reader"],
			});
			expect(diffFingerprints(a, live)).toEqual([]);
		});
	});
});
