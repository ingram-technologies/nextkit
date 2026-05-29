---
"@ingram-tech/biome-config": minor
---

Enforce `noNonNullAssertion` and `noExplicitAny` as **errors** (previously
`warn`), so the house rules "no non-null `!`" and "no `any`" actually fail
`biome check` instead of only being documented. Sites that currently rely on `!`
or explicit `any` will see new errors — replace `!` with guard clauses / optional
chaining, and give `any` a real type (or `unknown` + narrowing).
