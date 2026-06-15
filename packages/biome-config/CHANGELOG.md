# @ingram-tech/biome-config

## 0.1.1

### Patch Changes

- 419b229: **Deprecated** in favor of `@ingram-tech/oxlint-config`. The fleet has moved from
  Biome to the oxc toolchain (oxlint + oxfmt). This package is frozen and gets no
  further rule updates; it stays published only so existing pins keep resolving.
  The `@biomejs/biome` peer dependency is dropped so the deprecated package no
  longer pulls Biome into installs. Migrate with the codemod in
  [`docs/oxlint-migration.md`](https://github.com/ingram-technologies/nextkit/blob/main/docs/oxlint-migration.md).
