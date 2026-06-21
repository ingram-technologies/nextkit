// Coerce Postgres value representations back to the JS types app code expects.
//
// Why these exist: response/validation schemas in nextkit sites are typically
// written against supabase-js / PostgREST, which parsed `timestamptz` into ISO
// strings and `numeric` into JS numbers. Direct `pg` (and Drizzle on top of it)
// surfaces those columns differently — `numeric` as a string (to avoid losing
// precision), and `timestamp(..., { mode: "string" })` as Postgres' own text
// form ("2026-06-21 18:22:08.331494+00", space separator, short offset). Neither
// satisfies a schema expecting `z.number()` / strict `z.iso.datetime()`.
//
// Use these at the read/response boundary when handing Drizzle/`pg` rows to such
// a schema. They are presentation coercions, not domain math — keep money
// arithmetic on the string/decimal value, and only convert for output.

/**
 * Normalize a Postgres timestamp string to a strict ISO-8601 UTC string
 * ("2026-06-21T18:22:08.331Z"), the form `z.iso.datetime()` (no offset) accepts.
 *
 * `Date` parses both Postgres' space-separated form and supabase-js's `+00:00`
 * offset form to the same instant, and `.toISOString()` emits the canonical
 * `T…Z`. `null` passes through.
 */
export function pgTimestampToIso(value: string): string;
export function pgTimestampToIso(value: null): null;
export function pgTimestampToIso(value: string | null): string | null;
export function pgTimestampToIso(value: string | null): string | null {
	return value === null ? null : new Date(value).toISOString();
}

/**
 * Coerce a Postgres `numeric` value (which `pg`/Drizzle return as a string to
 * preserve arbitrary precision) to a JS number, for schemas that expect
 * `z.number()`. `null` passes through.
 *
 * Lossy for values outside `Number`'s safe range — only use at the response
 * boundary, never for money math (keep that on the string/decimal value).
 */
export function pgNumericToNumber(value: string): number;
export function pgNumericToNumber(value: null): null;
export function pgNumericToNumber(value: string | null): number | null;
export function pgNumericToNumber(value: string | null): number | null {
	return value === null ? null : Number(value);
}
