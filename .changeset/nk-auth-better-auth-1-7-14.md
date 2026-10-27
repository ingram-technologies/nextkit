---
"@ingram-tech/nk-auth": minor
---

Better Auth 1.7.14: `better-auth` and `@better-auth/passkey` are pinned to
exactly `1.7.14` in `peerDependencies`. 1.7.8-1.7.14 change no table, so
there is no chain delta and no migration to run first; a site bumps nk-auth
and sets both pins to `1.7.14` (`nk doctor` fails until it does). The range
carries fixes worth having: a password reset or change no longer keeps the
new password when revoking the other sessions fails, and the JWT plugin
verifies with the stored key's algorithm rather than the token header's.
1.7.13 also stops listing type-only exports as values, so a site that
value-imports a Better Auth type now fails type-check instead of at runtime.
