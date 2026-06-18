// PGlite dev/test harness — Postgres-in-WASM, no Docker. Ported from a proven
// app-level `scripts/pglite-dev.ts` (whose own comment said it should "move into
// the shared package so the whole fleet inherits it"). PGlite 0.5.x is
// PostgreSQL 18.3, so plpgsql / gen_random_uuid() / RLS all work and dev matches
// a pg18 prod target.
//
// This module is the only place the PGlite deps are imported; it loads solely
// via the "@ingram-tech/nk-db/pglite" subpath (dev/test), never from the main
// entry, so production bundles stay clean.

import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { PGlite, type Extensions } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import type { Pool } from "pg";
import { resetPublicTables } from "./reset.js";

export interface PgliteServerOptions {
	/** Persisted data dir; omit for an in-memory database (tests). */
	dataDir?: string;
	/** Host to bind the TCP socket on. Default `127.0.0.1`. */
	host?: string;
	/** Port for the TCP socket. Default `PGLITE_PORT` env or `5432`. */
	port?: number;
	/** Wipe `dataDir` before booting (rebuild after adding a migration). */
	fresh?: boolean;
	/** Drizzle migrations folder for the default applier. Default `drizzle`. */
	migrationsFolder?: string;
	/** Override how migrations are applied (e.g. raw-SQL apps). */
	migrate?: (db: PGlite) => Promise<void>;
	/**
	 * PGlite contrib/extension modules to register at create time — e.g.
	 * `{ pg_trgm }` from `@electric-sql/pglite/contrib/pg_trgm` or `{ vector }`
	 * from `@electric-sql/pglite/vector`. Required when your migrations
	 * `CREATE EXTENSION` them: PGlite only knows the extensions passed here.
	 */
	extensions?: Extensions;
}

export interface PgliteServer {
	db: PGlite;
	server: PGLiteSocketServer;
	/** Connection string the app's `pg.Pool` should use. */
	databaseUrl: string;
	stop: () => Promise<void>;
}

const defaultMigrate =
	(migrationsFolder: string) =>
	async (db: PGlite): Promise<void> => {
		const { drizzle } = await import("drizzle-orm/pglite");
		const { migrate } = await import("drizzle-orm/pglite/migrator");
		await migrate(drizzle(db), { migrationsFolder });
	};

/**
 * Boot PGlite, apply migrations (on a fresh/in-memory db), and expose it over a
 * TCP socket so a normal `pg.Pool` connects via `DATABASE_URL` with no app code
 * changes. Reused by both `startPgliteDev` (persisted) and `createTestDb`
 * (in-memory). The socket server is single-connection — keep the consuming pool
 * at `max: 1` (createPool does this for local hosts).
 */
export const createPgliteServer = async (
	options: PgliteServerOptions = {},
): Promise<PgliteServer> => {
	const host = options.host ?? "127.0.0.1";
	const port = options.port ?? Number(process.env.PGLITE_PORT ?? 5432);
	const migrationsFolder = options.migrationsFolder ?? "drizzle";
	const { dataDir } = options;

	if (options.fresh && dataDir && existsSync(dataDir)) {
		await rm(dataDir, { recursive: true, force: true });
	}
	const needsMigrations = !dataDir || !existsSync(dataDir);
	const db = dataDir
		? await PGlite.create({ dataDir, extensions: options.extensions })
		: await PGlite.create({ extensions: options.extensions });
	if (needsMigrations) {
		await (options.migrate ?? defaultMigrate(migrationsFolder))(db);
	}

	const server = new PGLiteSocketServer({ db, host, port });
	await server.start();
	const databaseUrl = `postgresql://postgres:postgres@${host}:${port}/postgres`;
	const stop = async (): Promise<void> => {
		await server.stop().catch(() => {});
		await db.close().catch(() => {});
	};
	return { db, server, databaseUrl, stop };
};

/**
 * `nk dev`'s PGlite mode: boot a persisted local Postgres, then `next dev` with
 * `DATABASE_URL` pointed at it. Invoked by the `nk-pglite-dev` bin.
 */
export const startPgliteDev = async (
	options: PgliteServerOptions & { nextArgs?: string[] } = {},
): Promise<void> => {
	const { spawn } = await import("node:child_process");
	const { databaseUrl, stop } = await createPgliteServer({
		dataDir: options.dataDir ?? ".pglite",
		...options,
	});
	console.log(
		`nk(pglite): Postgres 18 (WASM) ready on ${databaseUrl} — no Docker, no Supabase CLI`,
	);

	const child = spawn(
		"bunx",
		["next", "dev", "--turbopack", ...(options.nextArgs ?? [])],
		{ stdio: "inherit", env: { ...process.env, DATABASE_URL: databaseUrl } },
	);

	let closing = false;
	const close = async (code: number): Promise<void> => {
		if (closing) return;
		closing = true;
		await stop();
		process.exit(code);
	};
	process.on("SIGINT", () => child.kill("SIGINT"));
	process.on("SIGTERM", () => child.kill("SIGTERM"));
	child.on("exit", (code) => void close(code ?? 0));
};

export interface TestDb {
	/** A `pg.Pool` (max:1) bound to the in-memory database over the socket. */
	pool: Pool;
	databaseUrl: string;
	/** TRUNCATE every public table — call in Vitest `beforeEach`. */
	reset: () => Promise<void>;
	/** Close the pool and the database — call in `afterAll`. */
	close: () => Promise<void>;
}

/**
 * An in-memory PGlite for integration tests. Real Postgres semantics, instant,
 * no cleanup. Run with Vitest `fileParallelism: false` (the socket is
 * single-connection) and close in `afterAll` (modules are isolated per file).
 *
 * Transport note: this harness is socket + `pg.Pool`, which is what a Next site
 * dialing `DATABASE_URL` wants — but that single-connection socket is also why it
 * needs serial files. A pure in-process Drizzle/PGlite harness (no socket) runs
 * files in parallel and is faster, which is what an actual service reached for.
 * Both share `resetPublicTables`. If a second in-process consumer appears, the
 * move is to promote an in-process harness to first-class here, not to bolt one
 * beside this socket default.
 */
export const createTestDb = async (
	options: PgliteServerOptions = {},
): Promise<TestDb> => {
	const { Pool } = await import("pg");
	const { databaseUrl, stop } = await createPgliteServer(options);
	const pool = new Pool({ connectionString: databaseUrl, max: 1 });
	const reset = (): Promise<void> =>
		resetPublicTables((sql) => pool.query<{ tablename: string }>(sql));
	const close = async (): Promise<void> => {
		await pool.end();
		await stop();
	};
	return { pool, databaseUrl, reset, close };
};
