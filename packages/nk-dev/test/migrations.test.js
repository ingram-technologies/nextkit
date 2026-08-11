import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findings } from "../lib/doctor.js";
import {
	checkSeal,
	migrationsFolder,
	readSeal,
	unmodelledKinds,
	verifySeal,
	writeSeal,
} from "../lib/migrations.js";

let dir;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "nk-migrations-"));
	mkdirSync(join(dir, "drizzle", "meta"), { recursive: true });
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

/** Write a chain of `[tag, sql]` pairs plus the journal that names them. */
const writeChain = (...pairs) => {
	for (const [tag, sql] of pairs)
		writeFileSync(join(dir, "drizzle", `${tag}.sql`), sql);
	writeFileSync(
		join(dir, "drizzle", "meta", "_journal.json"),
		JSON.stringify({
			version: "7",
			dialect: "postgresql",
			entries: pairs.map(([tag], idx) => ({
				idx,
				when: 1_700_000_000_000 + idx,
				tag,
			})),
		}),
	);
};

const seal = () => {
	const state = verifySeal(dir, "drizzle");
	writeSeal(dir, "drizzle", state.chain);
};

describe("the migration seal", () => {
	it("passes when every sealed migration still hashes the same", () => {
		writeChain(
			["0000_init", "create table a ();"],
			["0001_more", "create table b ();"],
		);
		seal();
		expect(checkSeal(dir)).toEqual({ ok: true });
	});

	it("fails when an already-sealed migration's bytes change", () => {
		writeChain(["0000_init", "create table a ();"]);
		seal();
		writeFileSync(
			join(dir, "drizzle", "0000_init.sql"),
			"create table a (id int);",
		);

		const result = checkSeal(dir);
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/0000_init changed after it was sealed/);
	});

	// Whitespace-only edits are the realistic failure: a formatter sweeping the
	// repo rewrites the file without changing a single statement, and every
	// database that already ran it recorded the old hash.
	it("fails on a whitespace-only edit", () => {
		writeChain(["0000_init", "create table a ();"]);
		seal();
		writeFileSync(join(dir, "drizzle", "0000_init.sql"), "create table a ();\n");
		expect(checkSeal(dir).ok).toBe(false);
	});

	it("fails when a newly generated migration is unsealed", () => {
		writeChain(["0000_init", "create table a ();"]);
		seal();
		writeChain(
			["0000_init", "create table a ();"],
			["0001_new", "create table b ();"],
		);

		const result = checkSeal(dir);
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/0001_new is unsealed/);
	});

	it("fails when a sealed migration vanishes from the journal", () => {
		writeChain(
			["0000_init", "create table a ();"],
			["0001_more", "create table b ();"],
		);
		seal();
		writeChain(["0000_init", "create table a ();"]);

		expect(checkSeal(dir).reason).toMatch(/0001_more was sealed but is no longer/);
	});

	// A squash rewrites the baseline on purpose. Resealing is how that intent is
	// recorded, and the changed hashes are visible in the diff.
	it("accepts a resealed chain after a squash", () => {
		writeChain(
			["0000_init", "create table a ();"],
			["0001_more", "create table b ();"],
		);
		seal();
		writeChain(["0000_baseline", "create table a (); create table b ();"]);
		expect(checkSeal(dir).ok).toBe(false);

		seal();
		expect(checkSeal(dir)).toEqual({ ok: true });
		expect(Object.keys(readSeal(dir, "drizzle"))).toEqual(["0000_baseline"]);
	});

	it("is a no-op on a repo with no migration journal", () => {
		rmSync(join(dir, "drizzle"), { recursive: true });
		expect(checkSeal(dir)).toEqual({ ok: true });
	});

	it("reports a journal entry whose .sql file is missing", () => {
		writeChain(["0000_init", "create table a ();"]);
		rmSync(join(dir, "drizzle", "0000_init.sql"));
		expect(checkSeal(dir).reason).toMatch(/has no drizzle\/0000_init\.sql/);
	});

	it("honours `out:` from drizzle.config.ts", () => {
		writeFileSync(
			join(dir, "drizzle.config.ts"),
			`export default { out: "./db/migrations", dialect: "postgresql" };`,
		);
		expect(migrationsFolder(dir)).toBe("./db/migrations");
	});
});

describe("unmodelled DDL detection", () => {
	// The class of statement that drizzle's snapshot does not represent, so a
	// chain regenerated from schema.ts silently drops it.
	it.each([
		["create function f() returns int as $$ select 1 $$ language sql;", "function"],
		["create or replace function f() returns void as $$ begin end $$;", "function"],
		[
			"create trigger t after insert on a for each row execute function f();",
			"trigger",
		],
		[
			"create constraint trigger t after insert on a execute function f();",
			"trigger",
		],
		[
			'alter table a add constraint c foreign key ("b") references b(id) deferrable initially deferred;',
			"deferrable",
		],
		["grant select on table a to anon;", "grant"],
		["revoke all on table a from public;", "grant"],
		["create role authenticated;", "role"],
		[`create extension if not exists "pgcrypto";`, "extension"],
		["create materialized view mv as select 1;", "materialized-view"],
		["do $$ begin perform 1; end $$;", "do-block"],
	])("flags %s as %s", (sql, kind) => {
		expect(unmodelledKinds(sql)).toContain(kind);
	});

	it("passes plain generated DDL through clean", () => {
		expect(
			unmodelledKinds(
				`CREATE TABLE "users" ("id" uuid PRIMARY KEY NOT NULL);\n--> statement-breakpoint\nALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;`,
			),
		).toEqual([]);
	});

	// Keywords inside comments, string literals and function bodies are not
	// statements — matching them would make the inventory useless noise.
	it("ignores keywords in comments, literals and dollar-quoted bodies", () => {
		expect(unmodelledKinds("-- create trigger t on a\ncreate table a ();")).toEqual(
			[],
		);
		expect(
			unmodelledKinds("insert into a (note) values ('grant select');"),
		).toEqual([]);
		expect(
			unmodelledKinds(
				"create table a ();\n/* revoke all on a */\ninsert into b values ($tag$ create role x $tag$);",
			),
		).toEqual([]);
	});

	it("keeps the outer CREATE FUNCTION even when its body is stripped", () => {
		expect(
			unmodelledKinds(
				"create function f() returns trigger as $fn$ begin return new; end $fn$ language plpgsql;",
			),
		).toEqual(["function"]);
	});
});

describe("nk doctor: migration chain", () => {
	const find = (id) => findings(dir).find((f) => f.id === id);

	beforeEach(() => {
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({
				name: "site",
				dependencies: { "@ingram-tech/nk-dev": "^0.10.0" },
			}),
		);
	});

	it("warns about an unsealed chain and seals it on --fix", () => {
		writeChain(["0000_init", "create table a ();"]);
		const f = find("migrations:unsealed");
		expect(f.level).toBe("warn");

		f.fix(dir);
		expect(readSeal(dir, "drizzle")).toHaveProperty("0000_init");
		expect(find("migrations:unsealed")).toBeUndefined();
	});

	it("declares which unmodelled DDL the chain carries", () => {
		writeChain(
			["0000_init", "create table a ();"],
			[
				"0001_fn",
				"create function f() returns int as $$ select 1 $$ language sql;",
			],
			["0002_grant", "grant select on table a to anon;"],
		);
		seal();

		const f = find("migrations:unmodelled-ddl");
		expect(f.level).toBe("warn");
		expect(f.message).toMatch(/2 of 3 migration/);
		expect(f.message).toMatch(/function, grant/);
	});

	it("says nothing when the chain is purely generated output", () => {
		writeChain(["0000_init", `CREATE TABLE "a" ("id" uuid PRIMARY KEY NOT NULL);`]);
		seal();
		expect(find("migrations:unmodelled-ddl")).toBeUndefined();
	});

	it("says nothing on a repo without migrations", () => {
		rmSync(join(dir, "drizzle"), { recursive: true });
		expect(findings(dir).some((f) => f.id.startsWith("migrations:"))).toBe(false);
	});
});
