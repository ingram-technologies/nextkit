# @ingram-tech/nk-email

## 0.3.0

### Minor Changes

- 72e3fed: Add first-class one-click unsubscribe and a shared HTML escaper.

  - `sendEmail` now accepts a typed `listUnsubscribe: { url, mailto? }` option and
    expands it into the correct RFC 8058 `List-Unsubscribe` /
    `List-Unsubscribe-Post` header pair (explicit `headers` still win). Any
    non-transactional send should set it for bulk-sender compliance.
  - Export `buildListUnsubscribeHeaders({ url, mailto? })` for callers that build
    headers themselves.
  - Export `escapeHtml(value)` — the five-character HTML escaper that had been
    copy-pasted into every email producer.

## 0.2.0

### Minor Changes

- 9a52274: Renamed the package from `@ingram-tech/email` to `@ingram-tech/nk-email` for
  consistency with the other `nk-*` packages. The API is unchanged — update your
  imports from `@ingram-tech/email` to `@ingram-tech/nk-email`. The old package is
  deprecated on npm.

  Also in this release: `sendEmail` now applies a default 30s request timeout
  (override via the new `timeoutMs` option) instead of hanging indefinitely on a
  stalled connection. `fromAddress` validates the display name — it rejects control
  characters and newlines and RFC 5322-quotes names containing specials — so a name
  can no longer malform the sender address.

> Versions `0.1.0`–`0.1.2` below were published under the old package name
> `@ingram-tech/email`, which is now deprecated.

## 0.1.2

### Patch Changes

- 568ea58: `keys()` now narrows the validated env vars with a combined guard instead of
  `as string` casts — no behavior change, but it follows the house "no `as` on
  external input" rule that the package documents.

## 0.1.1

### Patch Changes

- Add explicit `.js` extensions to relative re-exports in the package entry point. The package ships as `"type": "module"`, so the previous extensionless `export … from "./client"` emitted invalid ESM that Node/Bun could not resolve at runtime (`Cannot find module …/dist/client`) when consumed unbundled. Imports now resolve correctly.
