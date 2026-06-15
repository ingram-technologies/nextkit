# @ingram-tech/newsletter

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
