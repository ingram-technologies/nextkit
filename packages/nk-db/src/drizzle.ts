import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { type RlsClaims, type RlsOptions, resolveRlsConfig } from "./rls.js";

/**
 * Build the Drizzle instance on the shared pool. This is the default query path
 * for app tables — schema-first, with `drizzle-kit` generating the migrations
 * (kills the hand-written-SQL drift). It rides the same `pg.Pool` that backs the
 * raw helpers and Better Auth, so there's still exactly one pool per process.
 *
 *   import * as schema from "./schema";
 *   export const pool = createPool();
 *   export const db = createDb(pool, schema);
 */
export const createDb = <TSchema extends Record<string, unknown>>(
	pool: Pool,
	schema: TSchema,
): NodePgDatabase<TSchema> => drizzle(pool, { schema });

/** The transaction handle Drizzle hands its `db.transaction(fn)` callback. */
type DrizzleTx<TSchema extends Record<string, unknown>> = Parameters<
	Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

/**
 * Run `fn` inside a Drizzle transaction **scoped to a user**, so RLS policies
 * apply on a direct connection (no PostgREST). It sets `request.jwt.claims` +
 * `SET LOCAL ROLE` (default `authenticated`) as the first statement, so existing
 * `auth.uid()` policies fire unchanged; the `tx` passed to `fn` is a normal
 * Drizzle transaction (full query builder + `tx.execute`). Use for user-facing
 * reads/writes; use plain `db` for service-role paths. The connection role must
 * not bypass RLS for the rows touched — see `rls.ts`.
 *
 *   const notes = await withRlsTransaction(db, { sub: user.id }, (tx) =>
 *       tx.select().from(schema.notes),
 *   );
 */
export const withRlsTransaction = <TSchema extends Record<string, unknown>, T>(
	db: NodePgDatabase<TSchema>,
	claims: RlsClaims,
	fn: (tx: DrizzleTx<TSchema>) => Promise<T>,
	options: RlsOptions = {},
): Promise<T> =>
	db.transaction(async (tx) => {
		const { role, claimsSetting, claimsJson } = resolveRlsConfig(claims, options);
		await tx.execute(
			sql`select set_config(${claimsSetting}, ${claimsJson}, true), set_config('role', ${role}, true)`,
		);
		return fn(tx);
	});
