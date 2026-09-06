---
"@ingram-tech/nk-dev": minor
---

New oxlint rule `nextkit/no-server-env-in-client` (error): a `"use client"`
file may read only `NEXT_PUBLIC_*` and `NODE_ENV`. Next inlines nothing else
into client bundles, so any other `process.env.X` read from a client component
is `undefined` in the browser while working in dev, in tests, and in every
server render of the same module — the feature silently never happens. An
allowlist rather than a list of secret names, because such a list goes stale
the moment someone adds an integration and the miss is invisible. The fix is
to read the value on the server and pass it down, not to rename it
`NEXT_PUBLIC_`, which publishes it to every visitor.
