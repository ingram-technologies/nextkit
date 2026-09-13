---
"@ingram-tech/nk-db": minor
---

**`nk-pg-fingerprint`** and `@ingram-tech/nk-db/fingerprint`: a catalog-level schema fingerprint (functions, triggers, policies, RLS, grants, ownership, roles, and everything the drizzle snapshot does model) of a fresh PGlite booted from a chain (`chain`, files exec'd whole in journal order so a pg_dump baseline works; `--dep`, `--id758`, `--ext`, `--pre`) or of a live database (`db` / a URL), plus a set-wise per-key `diff` that exits 2 on any difference. `--schemas` and `--roles` scope it. This is the squash / baseline equivalence gate, moved here from financica so every site squashes the same way.
