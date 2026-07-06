---
"@ingram-tech/nk-auth": patch
---

Security and correctness fixes across the gating slice:

- `safeNext` / the middleware `next` param now reject backslashes and ASCII control characters. Browsers treat `\` as `/` in http(s) URLs and strip tab/newline while parsing, so values like `/\evil.com` or an encoded `/%09/evil.com` could previously be reflected into an off-origin redirect.
- The stale-cookie self-heal now emits deletion cookies with the `Secure` attribute for `__Secure-`/`__Host-`-prefixed cookies. Browsers reject a non-Secure deletion of a prefixed cookie, so over HTTPS the dead session cookie was never actually cleared and the handshake re-ran on every visit.
- `protectedPaths` match on segment boundaries: `"/app"` no longer gates `/application`.
- `verifyBackendJwt` tolerates 5s of clock skew (jose defaults to 0, failing legitimate tokens at exp/nbf boundaries) and throttles the forced JWKS reload to once per 30s window, so requests with a made-up `kid` can no longer trigger unbounded refetches against the auth origin.
- The packaged migration no longer creates the `pgcrypto` extension in a Supabase-specific `extensions` schema, which failed outright on plain Postgres/PGlite; `gen_random_uuid()` is core Postgres since v13, so the extension was unnecessary.
- README: the route-handler example now uses `toNextJsHandler(auth)`; destructuring `auth.handler` (a plain function) yielded `GET = POST = undefined` and 405s on every auth endpoint.
- `@ingram-tech/nk-db` is consumed via the `workspace:` protocol like every other internal dependency, and `build` cleans `dist/` first so removed modules can't ship in the tarball.
