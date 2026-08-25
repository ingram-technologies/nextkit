---
"@ingram-tech/nk-db": patch
---

`idColumn` is typed `string` again, not `Id<E>`. Drizzle's `customType` has a
single `data` type for reads and writes, and the write side deliberately
accepts a raw uuid (a database default, Better Auth's `generateId`, a
client-minted PK), so the branded type shipped in 2.0.0 turned every such
write into a type error — thousands on the first site to upgrade. The runtime
is unchanged: a selected value is always the public id. Brand it at the seam
where it leaves the data layer (`ids.x.is()`, a typed response schema).
`encodedId()` still returns `SQL<Id<E>>`.
