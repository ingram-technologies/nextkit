import pg from "pg";

/** Postgres type OIDs we care about. */
const TIMESTAMPTZ_OID = 1184;
const TIMESTAMP_OID = 1114;

/**
 * Opt-in: keep `timestamptz` / `timestamp` columns as the raw ISO **strings**
 * Postgres sends, instead of letting `pg` parse them into JS `Date`s.
 *
 * Why this exists: supabase-js / PostgREST returned timestamps as strings, and
 * Supabase-generated row types declare them `string`. After moving to direct
 * `pg`, the same columns come back as `Date`, which silently breaks any code
 * doing string ops on them (and mismatches the generated types). Call this once
 * at startup if your row types expect strings.
 *
 * Note: with Drizzle you usually express this per-column instead
 * (`timestamp(..., { mode: "string" })`), so reach for that first on the golden
 * path; this global switch is for the raw-helper / legacy-types case.
 */
export const configureTimestampsAsStrings = (): void => {
	const keep = (value: string): string => value;
	pg.types.setTypeParser(TIMESTAMPTZ_OID, keep);
	pg.types.setTypeParser(TIMESTAMP_OID, keep);
};
