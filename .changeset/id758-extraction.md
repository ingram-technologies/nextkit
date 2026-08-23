---
"@ingram-tech/nk-db": minor
"@ingram-tech/nk-auth": patch
---

The id codec now lives in its own package, [`id758`](https://github.com/ingram-technologies/id758), which `@ingram-tech/nk-db` depends on. `@ingram-tech/nk-db/id` re-exports the whole `id758` surface, so existing imports keep working; `uuidGenerateId`, `toPrefixedId`, `fromPrefixedId` and `base58Id` are kept as deprecated aliases of `uuidv7`, `encodeId`, `decodeId` and `mintId`. One behaviour change inherited from `id758`: `fromPrefixedId` / `decodeId` now requires the full `prefix_<22 chars>` shape rather than decoding whatever follows the first underscore.
