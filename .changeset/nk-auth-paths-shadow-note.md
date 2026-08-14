---
"@ingram-tech/nk-auth": patch
---

`authBasePath` docs: note that a page matching a Better Auth endpoint shadows
it (static segments beat the `[...all]` catch-all) and that `nk doctor` flags
such collisions.
