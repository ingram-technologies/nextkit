# @ingram-tech/nk-email

## 0.6.1

### Patch Changes

- 9262afb: Publish `src/` alongside `dist/`, so the emitted `.js.map` and `.d.ts.map` files
  resolve. Bundlers no longer warn that "sourcemap points to missing source
  files", stack traces map back to real TypeScript, and go-to-definition lands on
  the annotated source instead of a generated `.d.ts`. Tests are excluded from the
  tarball.

## 0.6.0

### Minor Changes

- 71e49b2: The send-log can now archive rendered bodies and carry site-defined correlation
  data, so it can power a "preview exactly what was sent" surface — joined to your
  own records — instead of only an audit trail.

  `createMailer({ db, captureBody: true })` stores each send's rendered
  `{ html, text }` in a new `body` jsonb column; `SendOptions.captureBody`
  overrides it per send, which is how credential-bearing auth mail (verification,
  reset, magic link) stays out of the archive while still being logged. Parts are
  clamped at the exported `MAX_LOGGED_BODY_CHARS` (256k) and a clamped body is
  marked `{"truncated": true}` so a preview can say so.

  `SendOptions.meta` stores site-defined JSON in a new `meta` jsonb column — the
  seam for linking a row back to your own records, since `nk_email_log` carries no
  foreign key into a site's tables. Join on `(meta->>'personEmailId')::uuid`. Ids,
  not payloads: it's capped at the exported `MAX_LOGGED_META_CHARS` (4k) serialized
  and dropped rather than truncated if it doesn't fit or doesn't serialize, which
  never costs you the row or the send. Independent of `captureBody`.

  Both are **off by default** and each column is left out of the insert entirely
  when unset — existing sites (and nk-marketing, which builds its mailer without
  capture) are unaffected and need no new migration. Sites using either apply
  `migrations/0002_email_log_extras.sql`; `body` additionally brings the two
  burdens documented there and in the README: bodies containing live credentials,
  and retention, since nothing expires them.

  Docs: the README gains "Archiving bodies (opt-in)" with the purge recipe and
  "Linking a row to your own records", and `docs/transactional-email.md` gains
  "Send history and previews" separating the audit trail, the body archive, and the
  catalog's sample renders.

## 0.5.1

### Patch Changes

- a98f265: Test files are now type-checked. Every package excluded `**/*.test.ts` from the
  one tsconfig it used for both building and type-checking, so `tsc` never looked
  at a single test — and vitest strips types without checking them, so nothing
  did. Type-level assertions in tests were silently dead.

  `tsconfig.json` now excludes only `node_modules` and `dist` (and is what
  `type-check` and your editor use); the new `tsconfig.build.json` adds the test
  globs back, so `dist` still ships no tests.

  Fixing the 49 errors this surfaced was mostly mechanical (missing `.js`
  extensions on relative imports, which the NodeNext base config has always
  required), but three were real:

  - **nk-auth** `migrations.test.ts` passed `migrationsTable`, which is not a
    `PgliteServerOptions` key and was silently ignored — the test applied its
    migration chain twice, once as a dependency chain and again as the default app
    chain. It now stubs the primary applier so it tests the shape it documents.
  - **nk-seo** `metadata.test.ts` read `.type` off the `OpenGraph` union, where it
    is only present on the variants.
  - **nk-i18n**'s missing-key tests pass keys an empty catalog types as `never`.
    They exercise the runtime missing-key policy, which exists for catalogs that
    drift at runtime, so they now carry an explicit `@ts-expect-error`.

## 0.5.0

### Minor Changes

- 4a644dc: `EmailCatalogEntry.html` and `.text` are now optional, matching what
  `defineEmailCatalog` has always validated at runtime (an entry needs one _or_
  the other) and what real senders do — a message may carry only one MIME part.

  Previously both were typed as required `string`, so a builder returning
  `{ subject, html }` for an HTML-only mail (e.g. an invoice with a PDF attached)
  could not be spread into a catalog entry without a placeholder `text: ""`. The
  type now says what the module means. Existing catalogs are unaffected.

## 0.4.0

### Minor Changes

- 7a4ecdd: Add an optional send-log and an email catalog, so an operator surface can see
  what a product sends, when, and to whom — without the package losing its
  zero-dependency, fire-and-forget core.

  - **`createMailer({ db? })`** wraps `sendEmail` and, when given a `Queryable`
    (a `pg` pool / nk-db helper, by injection — no `pg` dependency added), records
    every dispatch to `nk_email_log` as `sent`/`failed` with `kind`
    (`transactional` | `marketing`), recipient, subject, sender, `templateKey`,
    `campaignKey`, and error. Logging is best-effort — a log-write failure never
    fails the send. With no `db` the mailer is a pure pass-through to `sendEmail`.
  - **`recordEmail(db, record)`** is the low-level writer (used by nk-marketing).
  - **`defineEmailCatalog(entries)` / `serializeEmailCatalog(entries)`** declare a
    manifest of every message a product sends — each entry built from the real
    sender so a preview can't drift — and serialize it to a committed
    `email-catalog.json` an operator surface reads. No route, no send.
  - New migration `migrations/0001_email_log.sql` (apply only if logging is on).

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
