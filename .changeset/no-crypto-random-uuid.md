---
"@ingram-tech/nk-dev": minor
---

Add `nextkit/no-crypto-random-uuid` (warn): keep UUIDv4 off the id write path.

nextkit ids are UUIDv7, so inserts land at the right edge of the primary-key
B-tree instead of scattering across it. One call site minting a stored id with
`crypto.randomUUID()` fragments that index while every other row stays ordered,
and the damage is invisible until the table is large enough that fixing it is
expensive. The rule flags `crypto.randomUUID()`, `globalThis.crypto.randomUUID()`
and `randomUUID` imported from `node:crypto`, pointing at `uuidGenerateId()` from
`@ingram-tech/nk-db/id` — or at dropping the mint entirely, since a column with
`default uuidv7()` already does it.

Deliberately not autofixable, because one of the correct answers is "leave it
alone". UUIDv7 is the wrong choice for a secret: it spends 48 bits on a
millisecond timestamp, leaving 74 random bits against v4's 122, and it leaks its
own creation time to whoever holds it. Bearer tokens, OAuth `state` and reset
links stay v4 behind a justified disable comment rather than being "fixed" into
weaker values.

Test files are exempt through a new `overrides` block in the shared oxlintrc:
test rows are ephemeral, so index locality is meaningless there and the
zero-import global keeps fixtures readable.
