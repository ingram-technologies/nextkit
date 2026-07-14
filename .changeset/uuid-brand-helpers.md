---
"@ingram-tech/nk-db": minor
---

`@ingram-tech/nk-db/id`: `uuidGenerateId` now returns the branded `Uuid` type
(still a plain string at runtime), and two new helpers ship the sanctioned
string→`Uuid` bless for trust boundaries: `isUuid` (narrowing guard, accepts
any RFC 9562 version) and `asUuid` (the throwing variant). Together they let
sites brand their Drizzle uuid columns (`.$type<Uuid>()`) so a raw uuid can no
longer be cast into a public `Id<E>` slot (or vice versa) without the compiler
objecting.
