---
"@ingram-tech/nk-db": minor
---

`withRls` / `withRlsTransaction` / `resolveRlsConfig` decode public ids in the
claims: any top-level string claim that is a prefixed id (`sub: "usr_…"`,
`org_id: "org_…"`) is written to `request.jwt.claims` as its uuid, so a policy
written as `user_id = auth.uid()` holds whether the app passes the raw uuid or
the public form. A public id is self-describing, so no registry is involved; a
raw uuid or any other string passes through unchanged. `decodeIdClaims` is
exported for callers that build the GUC themselves.
