---
"@ingram-tech/nk-db": minor
---

Add RLS-aware access for direct connections: `withRlsTransaction` (Drizzle) and
`withRls` (raw, sibling of `withTx`). They open a transaction and set
`request.jwt.claims` + `SET LOCAL ROLE` (default `authenticated`) before running
your callback, reproducing what PostgREST did — so existing `auth.uid()` policies
keep working on a direct `pg`/Drizzle connection, with claims taken straight from
the Better Auth session (no JWT minting, no JWKS issuer). GUCs are
transaction-local, so they don't leak across pooled connections. Also exports the
building blocks `resolveRlsConfig`, `rlsPreamble`, `RlsClaims`, `RlsOptions`, and
the `RLS_DEFAULT_ROLE` / `RLS_CLAIMS_SETTING` constants. Purely additive.
