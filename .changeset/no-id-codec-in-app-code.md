---
"@ingram-tech/nk-dev": minor
---

New lint `nextkit/no-id-codec-in-app-code` (warn): flags the bare codec
functions (`encodeId`, `decodeId`, `decodeAnyId`, `toPrefixedId`,
`fromPrefixedId`) imported from `id758` / `@ingram-tech/nk-db/id`, and
`ids.<entity>.encode()` / `.decode()` / `.decodeOrNull()` calls, outside
`ids.ts` / `id.ts` / `schema.ts` and tests. With nk-db 2's symmetric
`idColumn` and the `id758_*` Postgres functions, application code handles
public ids only; the lint lists every remaining hand conversion. `.is()`,
`.mint()` and `.prefix` are fine.

The guide gains the matching rule.
