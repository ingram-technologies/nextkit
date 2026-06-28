---
"@ingram-tech/nk-db": major
---

Drop Supabase-era compatibility. **Breaking:**

- **Connection string is `DATABASE_URL` only.** The `POSTGRES_URL_NON_POOLING`
  and `POSTGRES_URL` fallbacks (the Supabase integration's autopopulated vars)
  are no longer read by `getDatabaseUrl` / `dbEnv`. Set `DATABASE_URL`.
- **Removed `configureTimestampsAsStrings()`** (and the `./types` module). It was
  a shim for Supabase-generated row types that declared timestamps as `string`.
  On the golden path, express this per-column with Drizzle's
  `timestamp(..., { mode: "string" })`; the `pgTimestampToIso` /
  `pgNumericToNumber` response-boundary coercions remain for strict schemas.

No behavioral change to the pool, RLS helpers, or queries — only doc comments
were reworded to drop Supabase/PostgREST framing.
