---
"@ingram-tech/nk-db": patch
---

`createPool` no longer throws when no connection string is configured — it
returns a pool that constructs cleanly and defers the "set DATABASE_URL" error
to first use. Constructing the pool happens at module load in every app's
`lib/db`, so importing that module (and therefore `next build` collecting page
data, a unit test, or a CLI tool that never queries) must stay side-effect-free;
a hard throw at construction broke DB-less builds. A process that then runs a
real query without a URL still fails fast and legibly — the env is fixed at
process start, so this is never a transient miss. The deferred rejection is
async (a macrotask, like real connection I/O) so Next.js partial prerendering
sees a pending promise and postpones the segment, instead of a synchronous
render error. A present-but-invalid `DATABASE_URL` still throws eagerly.
