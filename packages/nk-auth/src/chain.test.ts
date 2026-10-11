import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJournal } from "@ingram-tech/nk-db/migrate";
import { createTestDb, type TestDb } from "@ingram-tech/nk-db/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	assertAuthChainApplied,
	authMigrationsFolder,
	AUTH_MIGRATIONS_TABLE,
	AuthChainNotAppliedError,
	authChainCheck,
} from "./chain.js";
import { SHIPPED_AUTH_CHAIN } from "./shipped-chain.js";

interface Journal {
	entries: Array<{ idx: number; tag: string }>;
}

/** The shipped chain's journal: the spec for what "fully applied" means. */
const shippedJournal = (): Journal =>
	JSON.parse(
		readFileSync(join(authMigrationsFolder(), "meta", "_journal.json"), "utf8"),
	) as Journal;

/** A chain folder holding the shipped entries with `idx < upTo`. */
const partialChain = (upTo: number): string => {
	const root = mkdtempSync(join(tmpdir(), "nkauth-partial-"));
	const folder = join(root, "migrations");
	mkdirSync(join(folder, "meta"), { recursive: true });
	const journal = shippedJournal();
	const entries = journal.entries.filter((entry) => entry.idx < upTo);
	for (const entry of entries) {
		copyFileSync(
			join(authMigrationsFolder(), `${entry.tag}.sql`),
			join(folder, `${entry.tag}.sql`),
		);
	}
	writeFileSync(
		join(folder, "meta", "_journal.json"),
		JSON.stringify({ ...journal, entries }),
	);
	return folder;
};

describe("assertAuthChainApplied", () => {
	let complete: TestDb;
	let lagging: TestDb;
	let unrecorded: TestDb;
	let partial: string;

	beforeAll(async () => {
		partial = partialChain(2);
		[complete, lagging, unrecorded] = await Promise.all([
			createTestDb({
				migrate: async () => {},
				dependencyMigrations: [
					{ folder: authMigrationsFolder(), table: AUTH_MIGRATIONS_TABLE },
				],
			}),
			createTestDb({
				migrate: async () => {},
				dependencyMigrations: [
					{ folder: partial, table: AUTH_MIGRATIONS_TABLE },
				],
			}),
			createTestDb({ migrate: async () => {} }),
		]);
	});

	afterAll(async () => {
		await Promise.all([complete.close(), lagging.close(), unrecorded.close()]);
		rmSync(join(partial, ".."), { recursive: true, force: true });
	});

	it("passes on a database with the whole chain applied", async () => {
		const status = await assertAuthChainApplied(complete.pool);
		expect(status?.pending).toEqual([]);
		expect(status?.recorded).toHaveLength(shippedJournal().entries.length);
	});

	it("names the missing migrations on a database that lags the package", async () => {
		const failure = await assertAuthChainApplied(lagging.pool).then(
			() => null,
			(error: unknown) => error,
		);
		expect(failure).toBeInstanceOf(AuthChainNotAppliedError);
		// The lagging database holds idx 0-1; everything the package ships after
		// that is pending, in chain order.
		expect((failure as AuthChainNotAppliedError).pending).toEqual(
			shippedJournal()
				.entries.filter((entry) => entry.idx >= 2)
				.map((entry) => entry.tag),
		);
		expect((failure as Error).message).toContain("nk-pg-migrate");
	});

	it("skips a database that never records the chain (a site owning its own baseline)", async () => {
		expect(await assertAuthChainApplied(unrecorded.pool)).toBeNull();
	});

	it("skips a journal this role cannot read instead of throwing", async () => {
		// A least-privilege auth role with no USAGE on `drizzle`: to_regclass
		// raised "permission denied" here and 500'd every session read.
		const restricted = await createTestDb({
			migrate: async () => {},
			dependencyMigrations: [{ folder: partial, table: AUTH_MIGRATIONS_TABLE }],
		});
		try {
			await restricted.pool.query("create role auth_only");
			await restricted.pool.query("revoke all on schema drizzle from public");
			await restricted.pool.query("set role auth_only");
			// Lagging, but unverifiable through this role: no throw either way.
			expect(await assertAuthChainApplied(restricted.pool)).toBeNull();
		} finally {
			await restricted.close();
		}
	});

	it("carries the shipped chain in code, file for file", () => {
		// The runtime check reads SHIPPED_AUTH_CHAIN, never migrations/ (the files
		// are not reliably on disk inside a server bundle). A new migration that
		// is not added there would pass the check on a database that lacks it.
		expect(SHIPPED_AUTH_CHAIN).toEqual(
			readJournal(authMigrationsFolder()).map(({ tag, hash }) => ({ tag, hash })),
		);
	});

	it("gives the per-process check the same verdicts without reading migrations/", async () => {
		await expect(authChainCheck(complete.pool)()).resolves.toBeUndefined();
		await expect(authChainCheck(unrecorded.pool)()).resolves.toBeUndefined();
		const failure = await authChainCheck(lagging.pool)().then(
			() => null,
			(error: unknown) => error,
		);
		expect((failure as AuthChainNotAppliedError).pending).toEqual(
			shippedJournal()
				.entries.filter((entry) => entry.idx >= 2)
				.map((entry) => entry.tag),
		);
	});

	it("memoizes per process and skips anything that is not a pg pool", async () => {
		let calls = 0;
		const counting = {
			query: (...args: unknown[]) => {
				calls += 1;
				return (lagging.pool.query as (...a: unknown[]) => unknown)(...args);
			},
			connect: () => lagging.pool.connect(),
		};
		const check = authChainCheck(counting);
		await expect(check()).rejects.toBeInstanceOf(AuthChainNotAppliedError);
		const after = calls;
		await expect(check()).rejects.toBeInstanceOf(AuthChainNotAppliedError);
		expect(calls).toBe(after);
		await expect(authChainCheck({ not: "a pool" })()).resolves.toBeUndefined();
		await expect(authChainCheck(undefined)()).resolves.toBeUndefined();
	});
});
