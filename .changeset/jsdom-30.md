---
"@ingram-tech/nk-dev": minor
---

Move the bundled DOM test environment to `jsdom` ^30.0.1, and declare the Node
version it actually needs.

jsdom 30's only breaking change is a raised Node floor:
`^22.22.2 || ^24.15.0 || >=26.0.0`. `nk-dev` still advertised `>=20`, which is
now a promise it can't keep — installing on Node 20 would succeed and then fail
at runtime inside `nk test` with a jsdom error that says nothing about Node.
`engines.node` mirrors jsdom's range verbatim rather than approximating it: the
range is deliberately gappy (23.x and 24.0–24.14 are excluded), so `>=22.22.2`
would let through versions jsdom rejects.

Sites on Node 24.15+ or 26 are unaffected. The test suite passes untouched
across the upgrade.
