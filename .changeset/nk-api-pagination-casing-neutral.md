---
"@ingram-tech/nk-api": minor
---

**Breaking.** The pagination block is `{ page, limit, total }`: `totalPages` is gone from `paginationMetaSchema`, `paginatedResponse()` and `paginate()`. It was derivable and the only camelCase key a snake_case API could not avoid; every remaining key is one word, so the contract reads the same in either casing. New `pageCount(pagination)` (from the root and `@ingram-tech/nk-api/client`) returns `Math.ceil(total / limit)`.

Migration:

- Replace each read of `pagination.totalPages` with `pageCount(pagination)`.
- Drop `totalPages` from test fixtures and response expectations: `paginate()` no longer returns it, and `paginatedResponse()` strips it from a parsed body.
- An API that keeps publishing a page count for its own clients adds it to its own schema.
