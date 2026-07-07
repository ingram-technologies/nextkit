# @ingram-tech/nk-email

## 0.3.1

### Patch Changes

- 51d7812: nk-i18n:

  - `negotiateAcceptLanguage` honors q-values per RFC 9110: the highest quality wins instead of raw header order, and a `q=0` (explicit rejection) can no longer be selected.
  - `t()` no longer throws at request time on a malformed catalog entry, a missing placeholder value, or an invalid locale tag — it degrades to the raw message and warns once per key. Previously one bad `fr` entry 500'd every French page rendering it, invisible to base-locale testing.
  - The ICU formatter cache is bounded (an unvalidated user-controlled locale could grow it without limit), and `MissingKeysPolicy` is documented as reserved/not-yet-consumed.

  nk-email:

  - `fromAddress` validates the local part with the same header-injection guard as the display name (it was interpolated raw into the address).
  - `buildListUnsubscribeHeaders` rejects values containing control characters, angle brackets, or commas, which would silently corrupt the RFC 8058 header pair.
  - `DEFAULT_TIMEOUT_MS` is exported from the package root (it was referenced by public JSDoc but unimportable).

  nk-marketing:

  - **`subscribe()` clears a global opt-out** — an explicit re-subscribe is fresh consent. Previously a contact who globally unsubscribed and later signed up again got a "successful" subscription but was silently excluded from every broadcast forever, with no code path able to detect it.
  - `identify`/`subscribe` validate the email up front with a descriptive error (mirroring the migration's check constraint) instead of surfacing a raw Postgres constraint violation.
  - A failing `releaseDelivery` can no longer abort the rest of a broadcast batch or mask the original send error in `sendLifecycle`.
  - Inbox preview text is sliced by code points, so a cut can't land inside an emoji's surrogate pair.

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
