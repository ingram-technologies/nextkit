# @ingram-tech/nk-marketing

## 0.5.2

### Patch Changes

- 798b39d: Rewrite the READMEs for an outside reader. These packages are published under an
  open-source licence, but the prose addressed the reader as if they worked here:
  "the Ingram billing foundation", "every Ingram API looks the same", "the one
  shared email client for Ingram sites", "the fleet-uniform view". That framing is
  gone, along with the pose it came with — unsourceable claims ("the one SEO
  safeguard everyone forgets on Vercel"), negation-reframes, bold scattered on
  non-key phrases, and roughly forty mid-sentence em-dashes.
  
  Documented failure modes, gotchas and code examples are unchanged. No API,
  identifier, env var or technical claim was touched.
- Updated dependencies [798b39d]
  - @ingram-tech/nk-email@0.6.2

## 0.5.1

### Patch Changes

- 9262afb: Publish `src/` alongside `dist/`, so the emitted `.js.map` and `.d.ts.map` files
  resolve. Bundlers no longer warn that "sourcemap points to missing source
  files", stack traces map back to real TypeScript, and go-to-definition lands on
  the annotated source instead of a generated `.d.ts`. Tests are excluded from the
  tarball.
- Updated dependencies [9262afb]
  - @ingram-tech/nk-email@0.6.1

## 0.5.0

### Minor Changes

- 5c1906c: `createMarketing({ captureBody })` — archive the rendered html/text of
  broadcast and lifecycle sends in `nk_email_log`, not just the envelope.
  
  nk-email has supported this since it gained the `body` column, but
  nk-marketing built its mailer with a hardcoded `{ db, defaultKind: "marketing" }`
  and no way to pass the option through. The result was a dead end for operator
  surfaces: marketing sends could be listed but never previewed, and there was no
  site-side fix, because the mailer is constructed inside the client.
  
  Off by default. The `body` column arrives with nk-email's
  `0002_email_log_extras.sql`, so defaulting it on would make every send fail to
  log on a site that has applied only `0001`. Turning it on means accepting that
  stored bodies are personal data nothing expires for you.
  
  This is one switch for the whole client rather than a per-send override as in
  nk-email: marketing bodies carry no credential, so there is no equivalent of a
  magic-link body to keep out of the archive.
  
  Also documents the send log in the README, which described neither `logSends`
  nor the log itself.

## 0.4.2

### Patch Changes

- Updated dependencies [71e49b2]
  - @ingram-tech/nk-email@0.6.0

## 0.4.1

### Patch Changes

- Updated dependencies [4a644dc]
  - @ingram-tech/nk-email@0.5.0

## 0.4.0

### Minor Changes

- 367448a: Record broadcasts and lifecycle sends to nk-email's `nk_email_log` as
  `kind: "marketing"` (with the send's `campaignKey`), so marketing history shows
  up in the same send-log an operator surface reads. Sends now route through
  nk-email's `createMailer` instead of `sendEmail` directly — a pure pass-through
  when logging is off. Opt out with `createMarketing({ logSends: false })`;
  logging requires nk-email's `0001_email_log.sql` migration and is best-effort
  (a logging failure never blocks a send).

### Patch Changes

- Updated dependencies [7a4ecdd]
  - @ingram-tech/nk-email@0.4.0

## 0.3.1

### Patch Changes

- 92bc16f: `subscribeToWire` no longer casts Wire's response with `as` or swallows the body
  with the inline `res.json().catch(() => ({}))` pattern (both flagged by
  code-style.md). It parses the body with an explicit runtime guard instead —
  staying zero-dependency, per the module's design — so an unexpected shape
  resolves to `null` rather than a trusted-but-unvalidated value.

## 0.3.0

### Minor Changes

- Add `subscribeToWire` — a zero-dependency client for the Wire newsletter service (wire.ingram.tech). Consumer sites forward a signup with one import (`await subscribeToWire({ email, source })`) using their server-side `WIRE_API_KEY`, instead of hand-rolling the fetch in every repo.

## 0.2.4

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

- Updated dependencies [51d7812]
  - @ingram-tech/nk-email@0.3.1

## 0.2.3

### Patch Changes

- f0d0e25: Docs only: replace site-specific examples in the README and type comments with
  generic placeholders. No runtime or API change.

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
