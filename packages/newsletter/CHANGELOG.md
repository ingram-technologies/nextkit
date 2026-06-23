# @ingram-tech/newsletter

## 0.4.2

### Patch Changes

- 9a52274: Renamed the package from `@ingram-tech/email` to `@ingram-tech/nk-email` for
  consistency with the other `nk-*` packages. The API is unchanged — update your
  imports from `@ingram-tech/email` to `@ingram-tech/nk-email`. The old package is
  deprecated on npm.

  Also in this release: `sendEmail` now applies a default 30s request timeout
  (override via the new `timeoutMs` option) instead of hanging indefinitely on a
  stalled connection. `fromAddress` validates the display name — it rejects control
  characters and newlines and RFC 5322-quotes names containing specials — so a name
  can no longer malform the sender address.

- Updated dependencies [9a52274]
  - @ingram-tech/nk-email@0.2.0

## 0.4.1

### Patch Changes

- 95a6b49: Make the shared TypeScript base emit valid Node ESM and enforce it. The base
  preset (`@ingram-tech/nk-dev/tsconfig/base.json`) used `moduleResolution:
"bundler"`, which silently tolerates extensionless relative imports in
  `"type": "module"` packages and emits them verbatim — invalid under Node ESM /
  Turbopack, and a recurring source of `ERR_MODULE_NOT_FOUND` ("Cannot find
  module './x'"). Switched the base to `module`/`moduleResolution: "nodenext"`, so
  tsc now errors (TS2835) on any extensionless relative import.

  This surfaced the same latent defect in three packages, now fixed by adding
  explicit `.js` extensions to their relative imports: nk-i18n, newsletter, and
  nk-auth (their published `dist` previously shipped extensionless ESM).

  App consumers are unaffected: the Next.js preset (`nextjs.json`) overrides back
  to `moduleResolution: "bundler"`, so app source still needs no `.js` extensions.
  nk-auth also overrides to "bundler" because it imports `next/server` /
  `next/headers` / `next/navigation`, whose type exports don't resolve under
  NodeNext — its relative imports still carry `.js`, so its dist is valid ESM.

## 0.4.0

### Minor Changes

- 5e1fab2: Upgrade the `zod` runtime dependency from v3 to v4, aligning newsletter with the
  rest of the workspace (`nk-db` and `nk-auth` already run zod 4). No public API
  changes; schemas were already written in the zod-4-compatible style.

## 0.3.0

### Minor Changes

- 16abb6f: Validate Supabase rows with Zod at the boundary instead of `as`-casting them, per
  the house "validate external input with Zod" rule. Row types are now inferred
  from the schemas (single source of truth), the subscribe path now checks the
  previously-dropped lookup error, and `zod` is a new runtime dependency. Malformed
  rows now throw a clear validation error rather than flowing through as a bad type.

### Patch Changes

- Updated dependencies [568ea58]
  - @ingram-tech/email@0.1.2

## 0.2.0

### Minor Changes

- 254b044: Add @ingram-tech/newsletter: Supabase-backed newsletter subscriptions + sending.
  Portable UUID schema (migrations shipped), injected client + own row types
  (Django-app model), RFC 8058 one-click unsubscribe, dependency-free overridable
  renderer. Sends via @ingram-tech/email.
