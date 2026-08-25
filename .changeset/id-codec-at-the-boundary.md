---
"@ingram-tech/nk-db": major
---

Ids are public everywhere in application code; the column and the database convert.

**Breaking:** `idColumn(entity)` now encodes on read. A row selected through
Drizzle (`select`, `returning()`, the relational `db.query`) carries the
entity's public id (`inv_…`) instead of the raw uuid, and the column's
TypeScript type is the branded `Id<E>`. Writes and WHERE values keep accepting
either form. `polymorphicIdColumn` is unchanged (raw on read: it cannot know
the prefix).

Migrating a site:

- `ids.x.encode(row.id)` after a Drizzle read is now a no-op (`encode` accepts
  an already-encoded id since `id758@1.1.0`); the new
  `nextkit/no-id-codec-in-app-code` lint in nk-dev lists every such call and
  every `ids.x.decode(…)` so they can be deleted.
- Anything that compared a Drizzle-read id to a raw uuid from another source
  (`row.user_id === session.userId` where the session came from raw SQL, a
  `${row.id}::uuid` interpolation, a Zod row schema with `.uuid()`) must read
  the public form on both sides — `id758_encode` in the SQL, `sqlUuid` /
  `encodedId` in the query, `ids.x.is()` in the schema.
- RLS: a `sub` claim that is now `usr_…` breaks a policy that casts
  `auth.uid()::uuid`. Install the SQL functions and use
  `id758_decode(auth.uid())`, or keep passing the raw uuid as `sub`.

No codemod ships with this: none of the rewrites above is mechanically safe
without knowing where a value came from, which is what the lint surfaces.

**New:**

- `@ingram-tech/nk-db/id/sql` — `ID758_SQL`, `ID758_SQL_STATEMENTS` and
  `id758Migration` (the statements joined by `--> statement-breakpoint`, to
  paste into a `drizzle-kit generate --custom` file). The functions
  `id758_encode(prefix, uuid)`, `id758_decode(id[, prefix])` and
  `id758_prefix(id)` let raw SQL, `psql`, RPCs and RLS policies speak public
  ids directly: `where id = id758_decode($1)` folds to a constant and uses the
  primary-key index.
- The PGlite harness (`createPgliteServer`, `createTestDb`, `nk dev`) installs
  those functions on every boot; `id758: false` opts out.
- `createIdColumns` returns `encodedId(entity, column)`: a raw-SQL selection of
  a uuid column as the entity's public id, via `id758_encode`.

Requires `id758@^1.1.0`.
