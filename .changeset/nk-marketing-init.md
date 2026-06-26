---
"@ingram-tech/nk-marketing": minor
---

New package: Postgres-backed marketing & lifecycle email.

The nk-db-native successor to `@ingram-tech/newsletter`. `createMarketing({ db,
baseUrl })` provides contacts + consent, newsletter audiences/subscriptions
(`subscribe`, `sendBroadcast`), and idempotent triggered campaigns
(`sendLifecycle` — at-most-once per `campaignKey` per contact, with global
opt-out suppression and claim-before-send). One-click unsubscribe (RFC 8058) is
attached on every send via `@ingram-tech/nk-email`; `unsubscribe(token)`
resolves either a per-list or a global token. Ships its own migration
(`migrations/0001_marketing.sql`) and takes the database by injection.
