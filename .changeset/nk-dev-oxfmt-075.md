---
"@ingram-tech/nk-dev": minor
---

oxfmt 0.75, which formats TOML: the shipped oxfmtrc no longer ignores
`*.toml` and the pre-commit hook passes `.toml` files to oxfmt. A site's TOML
files take the house style on the next `nk format` and fail `oxfmt --check`
until they do: run `nk format` once after upgrading and commit the result.
0.73's other breaking change, a reworked `--migrate prettier`, does not
apply: nothing in nk-dev runs it.
