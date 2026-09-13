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
import { createTestDb, type TestDb } from "@ingram-tech/nk-db/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	assertAuthChainApplied,
	AUTH_MIGRATIONS_FOLDER,
	AUTH_MIGRATIONS_TABLE,
	AuthChainNotAppliedError,
	authChainCheck,
} from "./chain.js";

/** A chain folder holding the shipped files up to and including `upTo`. */
const partialChain = (upTo: number): string => {
	const root = mkdtempSync(join(tmpdir(), "nkauth-partial-"));
	const folder = join(root, "migrations");
	mkdirSync(join(folder, "meta"), { recursive: true });
	const journal = JSON.parse(
		readFileSync(join(AUTH_MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"),
	) as { entries: Array<{ idx: number; tag: string }> };
	const entries = journal.entries.filter((entry) => entry.idx < upTo);
	for (const entry of entries) {
		copyFileSync(
			join(AUTH_MIGRATIONS_FOLDER, `${entry.tag}.sql`),
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
					{ folder: AUTH_MIGRATIONS_FOLDER, table: AUTH_MIGRATIONS_TABLE },
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
		expect(status?.recorded.length).toBeGreaterThanOrEqual(3);
	});

	it("names the missing migrations on a database that lags the package", async () => {
		const failure = await assertAuthChainApplied(lagging.pool).then(
			() => null,
			(error: unknown) => error,
		);
		expect(failure).toBeInstanceOf(AuthChainNotAppliedError);
		expect((failure as AuthChainNotAppliedError).pending).toEqual([
			"0003_better_auth_1_7_3",
		]);
		expect((failure as Error).message).toContain("nk-pg-migrate");
	});

	it("skips a database that never records the chain (a site owning its own baseline)", async () => {
		expect(await assertAuthChainApplied(unrecorded.pool)).toBeNull();
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
