import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

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
