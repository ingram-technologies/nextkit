import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import {
	type RlsClaims,
	type RlsOptions,
	resolveRlsConfig,
	rlsPreamble,
} from "./rls.js";

/** Anything that can run a query: a Pool, a PoolClient, or a tx scope. */
type Executor = Pick<Pool, "query">;

/**
 * A raw result shaped like pg's `QueryResult` or Drizzle's `tx.execute()` output
 * — just the `rows`. Consumed by {@link parseRows} / {@link parseMaybeRow} /
 * {@link parseOneRow}, which validate that array against a Zod schema.
 */
export interface RowsResult {
	rows: readonly unknown[];
}

export interface Queries {
	/**
	 * Run a query and return all rows. Pass a Zod row `schema` as the third
	 * argument to validate (and coerce) every row instead of trusting a `<T>`
	 * cast — the schema is also where `numeric`/timestamp coercion belongs
	 * (`z.coerce.number()`, an ISO transform), per the no-`as`-on-external-input
	 * rule.
	 */
	query: {
		<T extends QueryResultRow = QueryResultRow>(
			text: string,
			params?: unknown[],
		): Promise<T[]>;
		<S extends z.ZodType>(
			text: string,
			params: unknown[] | undefined,
			schema: S,
		): Promise<z.output<S>[]>;
	};
	/** Run a query expected to return at most one row; `null` when none. */
	maybeOne: {
		<T extends QueryResultRow = QueryResultRow>(
			text: string,
			params?: unknown[],
		): Promise<T | null>;
		<S extends z.ZodType>(
			text: string,
			params: unknown[] | undefined,
			schema: S,
		): Promise<z.output<S> | null>;
	};
	/** Run a query that must return exactly one row; throws otherwise. */
	one: {
		<T extends QueryResultRow = QueryResultRow>(
			text: string,
			params?: unknown[],
		): Promise<T>;
		<S extends z.ZodType>(
			text: string,
			params: unknown[] | undefined,
			schema: S,
		): Promise<z.output<S>>;
	};
	/** Run a write and return the affected row count. */
	execute: (text: string, params?: unknown[]) => Promise<number>;
}

const bind = (executor: Executor): Queries => {
	function query<T extends QueryResultRow = QueryResultRow>(
		text: string,
		params?: unknown[],
	): Promise<T[]>;
	function query<S extends z.ZodType>(
		text: string,
		params: unknown[] | undefined,
		schema: S,
	): Promise<z.output<S>[]>;
	async function query(
		text: string,
		params: unknown[] = [],
		schema?: z.ZodType,
	): Promise<unknown[]> {
		const result = await executor.query(text, params);
		return schema ? result.rows.map((row) => schema.parse(row)) : result.rows;
	}

	function maybeOne<T extends QueryResultRow = QueryResultRow>(
		text: string,
		params?: unknown[],
	): Promise<T | null>;
	function maybeOne<S extends z.ZodType>(
		text: string,
		params: unknown[] | undefined,
		schema: S,
	): Promise<z.output<S> | null>;
	async function maybeOne(
		text: string,
		params: unknown[] = [],
		schema?: z.ZodType,
	): Promise<unknown> {
		const result = await executor.query(text, params);
		const first = result.rows[0];
		if (first === undefined) return null;
		return schema ? schema.parse(first) : first;
	}

	function one<T extends QueryResultRow = QueryResultRow>(
		text: string,
		params?: unknown[],
	): Promise<T>;
	function one<S extends z.ZodType>(
		text: string,
		params: unknown[] | undefined,
		schema: S,
	): Promise<z.output<S>>;
	async function one(
		text: string,
		params: unknown[] = [],
		schema?: z.ZodType,
	): Promise<unknown> {
		const result = await executor.query(text, params);
		if (result.rows.length === 0) {
			throw new Error("Expected exactly one row, got none");
		}
		if (result.rows.length > 1) {
			throw new Error(`Expected exactly one row, got ${result.rows.length}`);
		}
		const row = result.rows[0];
		return schema ? schema.parse(row) : row;
	}

	const execute = async (text: string, params: unknown[] = []): Promise<number> => {
		const result = await executor.query(text, params);
		return result.rowCount ?? 0;
	};
	return { query, maybeOne, one, execute };
};

/**
 * Validate the `rows` of a raw result (a pg `QueryResult` or the output of
 * Drizzle's `tx.execute()`) against a Zod row schema, returning the parsed rows.
 *
 * This is the result-side counterpart to {@link Queries.query}'s `schema` arg,
 * for the Drizzle RLS path: inside `withRlsTransaction`, `tx.execute()` hands
 * back an untyped `{ rows }`, and this gives it the same validated/coerced
 * result the pool helpers have. The schema doubles as the coercion layer.
 */
export const parseRows = <S extends z.ZodType>(
	result: RowsResult,
	schema: S,
): z.output<S>[] => result.rows.map((row) => schema.parse(row));

/** Like {@link parseRows} but for at most one row; `null` when none. */
export const parseMaybeRow = <S extends z.ZodType>(
	result: RowsResult,
	schema: S,
): z.output<S> | null => {
	const first = result.rows[0];
	return first === undefined ? null : schema.parse(first);
};

/** Like {@link parseRows} but requires exactly one row; throws otherwise. */
export const parseOneRow = <S extends z.ZodType>(
	result: RowsResult,
	schema: S,
): z.output<S> => {
	if (result.rows.length === 0) {
		throw new Error("Expected exactly one row, got none");
	}
	if (result.rows.length > 1) {
		throw new Error(`Expected exactly one row, got ${result.rows.length}`);
	}
	return schema.parse(result.rows[0]);
};

export interface PoolQueries extends Queries {
	/**
	 * Run `fn` inside a single transaction on a dedicated client (`begin` /
	 * `commit`, `rollback` on throw). The `tx` passed to `fn` is a `Queries`
	 * bound to that client — use it, not the pool-level helpers, for the
	 * statements that must be atomic.
	 */
	withTx: <T>(fn: (tx: Queries) => Promise<T>) => Promise<T>;
	/**
	 * Like `withTx`, but first **scopes the transaction to a user** so RLS
	 * policies apply: it sets `request.jwt.claims` + `SET LOCAL ROLE` (default
	 * `authenticated`) before `fn`, so `auth.uid()`-style policies fire. Use this
	 * for user-facing reads/writes on a direct connection; keep `withTx` / `query`
	 * for service-role paths that should bypass RLS. The connection role must not
	 * bypass RLS for the rows touched — see `rls.ts`.
	 */
	withRls: <T>(
		claims: RlsClaims,
		fn: (tx: Queries) => Promise<T>,
		options?: RlsOptions,
	) => Promise<T>;
}

/**
 * Bind the raw-SQL helpers (`query` / `one` / `maybeOne` / `execute` / `withTx`)
 * to a pool. Signatures match what apps hand-rolled, so adopting
 * this is a find-and-replace of the import. Drizzle (via `createDb`) is the
 * default query path; these are the escape hatch for SQL the ORM is awkward at
 * (Postgres-function `select fn($1,…)` calls, `pgmq` draining, `pg_trgm`).
 */
export const createQueries = (pool: Pool): PoolQueries => {
	const base = bind(pool);
	// One transaction runner; `setup` (if any) runs after `begin`, before `fn` —
	// that's where withRls injects the claims/role GUCs.
	const runTx = async <T>(
		setup: ((client: PoolClient) => Promise<void>) | undefined,
		fn: (tx: Queries) => Promise<T>,
	): Promise<T> => {
		const client: PoolClient = await pool.connect();
		try {
			await client.query("begin");
			if (setup) await setup(client);
			const result = await fn(bind(client));
			await client.query("commit");
			return result;
		} catch (error) {
			// Swallow rollback failures: if the failing query destroyed the
			// connection, the rollback's own "Connection terminated" would mask the
			// real error.
			await client.query("rollback").catch(() => {});
			throw error;
		} finally {
			client.release();
		}
	};
	const withTx = <T>(fn: (tx: Queries) => Promise<T>): Promise<T> =>
		runTx(undefined, fn);
	const withRls = <T>(
		claims: RlsClaims,
		fn: (tx: Queries) => Promise<T>,
		options?: RlsOptions,
	): Promise<T> =>
		runTx(async (client) => {
			const { text, values } = rlsPreamble(resolveRlsConfig(claims, options));
			await client.query(text, values);
		}, fn);
	return { ...base, withTx, withRls };
};
