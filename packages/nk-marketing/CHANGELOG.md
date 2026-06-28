# @ingram-tech/nk-marketing

## 0.2.2

### Patch Changes

- beb294e: Docs/comments only: drop the "successor to `@ingram-tech/newsletter` (which was
  Supabase-bound)" framing from the README and migration header, and remove the
  stale reference to nk-db's removed `configureTimestampsAsStrings` helper. No code
  change.

## 0.2.0

### Minor Changes

- 2edaf36: New package: Postgres-backed marketing & lifecycle email.

  The nk-db-native successor to `@ingram-tech/newsletter`. `createMarketing({ db,
baseUrl })` provides contacts + consent, newsletter audiences/subscriptions
  (`subscribe`, `sendBroadcast`), and idempotent triggered campaigns
  (`sendLifecycle` — at-most-once per `campaignKey` per contact, with global
  opt-out suppression and claim-before-send). One-click unsubscribe (RFC 8058) is
  attached on every send via `@ingram-tech/nk-email`; `unsubscribe(token)`
  resolves either a per-list or a global token. Ships its own migration
  (`migrations/0001_marketing.sql`) and takes the database by injection.

### Patch Changes

- Updated dependencies [72e3fed]
  - @ingram-tech/nk-email@0.3.0
