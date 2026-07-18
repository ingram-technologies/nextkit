---
"@ingram-tech/nk-auth": patch
---

Fix a false-positive startup error in `createAuthMiddleware`. The construction
loop-safety check tested `signInPath.startsWith(protectedPath)`, a broader match
than the per-request gate's segment-boundary check — so a safe config like
`protectedPaths: ["/log"]` + `signInPath: "/login"` (or `protectedPaths: ["/"]`)
threw even though `/login` is never actually gated. Both the guard and the
request gate now share one segment-boundary `isProtected` predicate, so they
can't drift. Genuine loops (`signInPath` equal to or nested under a protected
path) still throw.

Also documents that the legacy `bcryptPassword` preset silently truncates at
bcrypt's 72-byte ceiling despite the 128-char policy — deliberately not
length-guarded, since a guard would break verifying the legacy hashes it exists
to support.
