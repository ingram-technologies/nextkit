import type { Pool, PoolClient, QueryResultRow } from "pg";

/** Anything that can run a query: a Pool, a PoolClient, or a tx scope. */
type Executor = Pick<Pool, "query">;

export interface Queries {
	/** Run a query and return all rows. */
	query: <T extends QueryResultRow = QueryResultRow>(
		text: string,
		params?: unknown[],
	) => Promise<T[]>;
	/** Run a query expected to return at most one row; `null` when none. */
	maybeOne: <T extends QueryResultRow = QueryResultRow>(
		text: string,
		params?: unknown[],
	) => Promise<T | null>;
	/** Run a query that must return exactly one row; throws otherwise. */
	one: <T extends QueryResultRow = QueryResultRow>(
		text: string,
		params?: unknown[],
	) => Promise<T>;
	/** Run a write and return the affected row count. */
	execute: (text: string, params?: unknown[]) => Promise<number>;
}

const bind = (executor: Executor): Queries => {
	const query = async <T extends QueryResultRow = QueryResultRow>(
		text: string,
		params: unknown[] = [],
	): Promise<T[]> => {
		const result = await executor.query<T>(text, params);
		return result.rows;
	};
	const maybeOne = async <T extends QueryResultRow = QueryResultRow>(
		text: string,
		params: unknown[] = [],
	): Promise<T | null> => {
		const rows = await query<T>(text, params);
		return rows[0] ?? null;
	};
	const one = async <T extends QueryResultRow = QueryResultRow>(
		text: string,
		params: unknown[] = [],
	): Promise<T> => {
		const rows = await query<T>(text, params);
		const row = rows[0];
		if (!row) throw new Error("Expected exactly one row, got none");
		if (rows.length > 1) {
			throw new Error(`Expected exactly one row, got ${rows.length}`);
		}
		return row;
	};
	const execute = async (text: string, params: unknown[] = []): Promise<number> => {
		const result = await executor.query(text, params);
		return result.rowCount ?? 0;
	};
	return { query, maybeOne, one, execute };
};

export interface PoolQueries extends Queries {
	/**
	 * Run `fn` inside a single transaction on a dedicated client (`begin` /
	 * `commit`, `rollback` on throw). The `tx` passed to `fn` is a `Queries`
	 * bound to that client — use it, not the pool-level helpers, for the
	 * statements that must be atomic.
	 */
	withTx: <T>(fn: (tx: Queries) => Promise<T>) => Promise<T>;
}

/**
 * Bind the raw-SQL helpers (`query` / `one` / `maybeOne` / `execute` / `withTx`)
 * to a pool. Signatures match what peppost/orbitr.ee hand-rolled, so adopting
 * this is a find-and-replace of the import. Drizzle (via `createDb`) is the
 * default query path; these are the escape hatch for SQL the ORM is awkward at
 * (Postgres-function `select fn($1,…)` calls, `pgmq` draining, `pg_trgm`).
 */
export const createQueries = (pool: Pool): PoolQueries => {
	const base = bind(pool);
	const withTx = async <T>(fn: (tx: Queries) => Promise<T>): Promise<T> => {
		const client: PoolClient = await pool.connect();
		try {
			await client.query("begin");
			const result = await fn(bind(client));
			await client.query("commit");
			return result;
		} catch (error) {
			await client.query("rollback");
			throw error;
		} finally {
			client.release();
		}
	};
	return { ...base, withTx };
};
