---
"@ingram-tech/nk-dev": patch
---

Pre-commit hook and exit-code correctness:

- **`format-staged` no longer commits unstaged hunks.** `oxfmt --write` rewrites the working tree and the re-`git add` swept everything into the commit — including hunks deliberately left out with `git add -p`. Partially staged files are now skipped with a warning.
- **Non-ASCII filenames are formatted again.** `git diff --name-only` octal-escapes them (`"\303\251 test.ts"`), which matched no real path, so such files were silently never formatted or re-staged; same fix in `nk format`'s SQL file listing. Both now use `-z`/NUL splitting.
- **Signal-killed tools fail the gate.** `run()`/`nk dev` treated a `null` exit status (OOM-kill, SIGSEGV) as success, letting a crashed linter pass `nk check`.
- `nk check` reads the SQL result from `formatSql`'s return value instead of the `process.exitCode` global (which misattributed any earlier failure to SQL); SQL formatting defaults carry the house `tabWidth: 4` / `printWidth: 88` (Prettier's own 80/2 applied before); deleted-but-tracked `.sql` files no longer crash `nk format`; the hook uses `existsSync` instead of spawning the Unix `test` binary per file; the unused `capture()` helper is gone; usage text no longer claims the no-database path is "plain dev" (it runs Turbopack).
