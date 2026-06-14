// The Ingram Postgres data layer. The PGlite dev/test harness lives behind the
// "@ingram-tech/nk-db/pglite" subpath so its WASM/dev-only deps never reach a
// production bundle.

export { createDb } from "./drizzle.js";
export { type DbEnv, dbEnv, getDatabaseUrl, isConfigured } from "./keys.js";
export { type CreatePoolConfig, createPool } from "./pool.js";
export { createQueries, type PoolQueries, type Queries } from "./queries.js";
export { configureTimestampsAsStrings } from "./types.js";
