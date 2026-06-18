# @ingram-tech/oxlint-config

## 0.2.2

### Patch Changes

- 5e1fab2: Raise the `oxlint` (`^1.70.0`) and `oxfmt` (`^0.55.0`) peer floors to the latest
  releases.

## 0.2.1

### Patch Changes

- tier-b: also exempt test/infra files (`**/*.test.ts(x)`, `__tests__/`, `test(s)/`)
  from the `pg` Pool/Client ban — tests legitimately build raw pg clients (e.g.
  connecting as a specific role to verify RLS isolation).

## 0.2.0

### Minor Changes

- Add a `tier-b.json` overlay for golden-path products (auth + Postgres). Extend it
  alongside the base config to enforce `no-restricted-imports`: bans
  `@supabase/supabase-js` and `pg`'s `Pool` / `Client` value imports (build the pool
  with `createPool()` from `@ingram-tech/nk-db`; `import type { Pool }` and
  `scripts/**` are exempt). The base config is unchanged, so marketing / Tier-A
  sites are unaffected.

## 0.1.0

- Initial published config: shared oxlint plugins + rules and the oxfmt config.
