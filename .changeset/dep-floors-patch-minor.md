---
"@ingram-tech/nk-auth": patch
"@ingram-tech/nk-billing": patch
"@ingram-tech/nk-dev": patch
"@ingram-tech/nk-i18n": patch
---

Raise runtime dependency floors to the current patch/minor releases.

`nk-auth` moves to `jose` ^6.2.6, `nk-billing` to `stripe` ^22.4.0, `nk-i18n` to
`intl-messageformat` ^11.2.13, and `nk-dev` to `oxlint` ^1.76.0, `knip` ^6.31.0
and `@testing-library/jest-dom` ^6.10.0.

No API changes. `nk-dev` ships the toolchain as real dependencies, so its bump
is what moves a consuming site's linter and dead-code checker — the new `oxlint`
reported no findings against this repo.
