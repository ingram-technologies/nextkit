# Creating a new nextkit package

A checklist for adding a package to nextkit. Keep packages small and focused —
one concern each.

## 1. Scaffold

```
packages/<name>/
  package.json
  README.md
  src/
    index.ts
    keys.ts          # if it reads any env vars
  tsconfig.json      # runtime packages only
  vitest.config.ts   # if it has tests
```

## 2. package.json essentials

- Name: `@ingram-tech/<name>`.
- `"license": "MIT"`, `"repository"` with the `directory` field, and
  `"publishConfig": { "access": "public" }`.
- `"files"`: `["dist"]` for runtime packages, `["<config file>"]` for config
  packages, `["bin"]` for tooling.
- Provide `build`, `type-check`, and `test` scripts (use `"true"` as a no-op for
  config/tooling packages so the workspace-wide `--filter '*'` commands pass).
- Runtime deps that the host app already provides (`next`, `react`) go in
  **`peerDependencies`**, never `dependencies` — this prevents duplicate-React
  and version-skew across sites.

## 3. Own your env contract

If the package needs environment variables, declare and validate them in
`src/keys.ts` (see `@ingram-tech/nk-email` for the zero-dep pattern). Never make
the host site edit a central config to use your package.

## 4. Stateful packages

If the package needs a database, follow the Django-app model in
[`philosophy.md`](./philosophy.md): ship your own migration, define your own row
types, take the client by injection. Keep auth/cross-cutting features opt-in.

## 5. Decide what's shared vs. local

Ask: does more than one site need this, with little variation? If the variation
is high (e.g. contact-form fields), ship the **server machinery** and let sites
own the UI/schema. Don't force a one-size component.

## 6. Document & enforce

- Write a README and, for non-trivial subsystems, a `docs/` entry.
- Push any rule the package implies down the
  [enforcement ladder](./philosophy.md#enforce-what-you-can-document-what-you-cant):
  a Biome rule or GritQL plugin beats a sentence in a doc.

## 7. Release

- `bun run changeset` — describe the change and pick the semver bump.
- Keep it **backward compatible**. If you must break, ship a codemod.
