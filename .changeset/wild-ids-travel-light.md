---
"@ingram-tech/nk-db": minor
---

**The id codec is now isomorphic.** `uuidGenerateId` used `node:crypto`'s
`randomBytes`, which made the whole of `@ingram-tech/nk-db/id` node-only even
though only minting needed it — every module touching an id inherited that, so a
Drizzle `schema.ts` could not encode/decode without risking `node:crypto` in a
client bundle, and sites resorted to dependency-injecting the codec around their
schema. Randomness now comes from Web Crypto (a global on Node 19+, Bun, Deno,
edge, browsers). `id.ts` has zero imports, and a test keeps it that way.

**`exports` now resolve under CJS.** Every subpath declared only an `"import"`
condition, so any CJS resolver failed with `ERR_PACKAGE_PATH_NOT_EXPORTED` —
including **drizzle-kit**, which meant a `schema.ts` importing
`@ingram-tech/nk-db/id` broke `drizzle-kit generate`. The conditions are now
`"default"`, which resolves under both `import` and `require`.

**New: `entityOf(registry, value)` / `decodeAnyId(registry, value)`.** A public
id is self-describing — its prefix names its entity — so it can be resolved with
no surrounding context. That is the primitive behind polymorphic FK decoding,
raw-SQL id binding, and generic event payloads. Sites were hand-rolling the loop
over `decodeOrNull`.

**New subpath: `@ingram-tech/nk-db/id/drizzle`** — `createIdColumns(registry)`
returns `idColumn(entity)` / `polymorphicIdColumn` (a `customType` whose
`toDriver` decodes a skinned id before it reaches Postgres, on WHERE values as
well as insert/update SET) plus `sqlUuid` / `sqlUuidArray` for the raw-SQL and
RPC args the column layer cannot reach. `dataType` stays `uuid`, so adopting it
needs no DDL and produces no `drizzle-kit` diff. It pulls only `drizzle-orm` and
the codec, never `pg`, because it is imported by `schema.ts`.
