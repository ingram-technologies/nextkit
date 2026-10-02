---
"@ingram-tech/nk-auth": minor
---

Better Auth 1.7.7: `better-auth` and `@better-auth/passkey` are pinned to
exactly `1.7.7` in `peerDependencies`. 1.7.5–1.7.7 change no table, so there
is no chain delta and no migration to run first; a site bumps nk-auth and sets
both pins to `1.7.7` (`nk doctor` fails until it does).
