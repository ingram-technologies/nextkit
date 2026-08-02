---
"@ingram-tech/nk-dev": minor
---

New oxlint rule `nextkit/no-redundant-node-crypto` (warn): flags the
`node:crypto` imports that are already on the Web Crypto global — `randomUUID`,
`getRandomValues`, `subtle` and `webcrypto`. Each pins a module to a Node-only
runtime for something it would have had regardless, and `subtle`/`webcrypto`
aren't even different objects from `globalThis.crypto.subtle`/`globalThis.crypto`.
Catches named imports, and member access through a namespace or default import
of the module. The rest of `node:crypto` (`createHash`, `createHmac`,
`randomBytes`, `timingSafeEqual`, …) has no drop-in global and is left alone, so
the usual fix is trimming one name off an import list.

This makes fleet-wide the invariant nk-db's id codec already holds by hand — its
`id.ts` is pinned to an empty import list by a test whose comment names
`node:crypto` for randomness as the tempting one, because a single Node-only
import there would make every module that touches an id Node-only.

Not autofixable: the call sites have to become member expressions on the global,
and an import named `crypto` shadows the global it stands in for. Keep an import
with a justified disable — `node:crypto`'s `randomUUID` takes a
`disableEntropyCache` option that Web Crypto's does not.
