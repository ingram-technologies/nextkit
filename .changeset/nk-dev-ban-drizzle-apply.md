---
"@ingram-tech/nk-dev": minor
---

`nk doctor` now fails on any script that lets **drizzle-kit apply schema**, and
the guide states the rule so it propagates to every site's CLAUDE.md.

drizzle-kit is **generate-only**; `nk-pg-migrate` (`@ingram-tech/nk-db`) is the
one runner that applies. Two commands are now flagged as errors (both
auto-fixable with `nk doctor --fix`):

- **`drizzle-kit push`** → the script is removed. It applies a diff straight to
  the live DB with no migration file and no journal entry — the schema-drift
  source. It has already drifted a production database in this fleet, and where
  the dev DB is shared it rewrites everyone's.
- **`drizzle-kit migrate`** → rewritten to `nk-pg-migrate`. drizzle-kit's
  migrator is opaque: it exits non-zero with no message (even on a clean no-op)
  and hides journal drift.

`drizzle-kit generate` is untouched — generating is the supported use.
`findings()` is now exported from `lib/doctor.js` so checks are unit-testable.
