# @ingram-tech/nk-forms

## 0.2.5

### Patch Changes

- Updated dependencies [a98f265]
  - @ingram-tech/nk-email@0.5.1

## 0.2.4

### Patch Changes

- Updated dependencies [4a644dc]
  - @ingram-tech/nk-email@0.5.0
  - @ingram-tech/bot-protection@0.4.1

## 0.2.3

### Patch Changes

- Updated dependencies [7a4ecdd]
  - @ingram-tech/nk-email@0.4.0
  - @ingram-tech/bot-protection@0.4.1

## 0.2.2

### Patch Changes

- b0ed085: Drop `as` casts on external input in favor of runtime narrowing (per
  code-style.md). `handleFormSubmission` now narrows the parsed request body with
  an `isRecord` type guard instead of casting it to `Record<string, unknown>`, and
  the client `getErrorMessage` helper relies on `in`-narrowing rather than
  `as { error: string }`. No behavior change.
- Updated dependencies [7fbb90c]
  - @ingram-tech/bot-protection@0.4.1

## 0.2.1

### Patch Changes

- 1d29f76: Re-export `checkBot` from the package root. Sites guarding a non-form endpoint
  (a checkout, an authed route) with the raw Vercel BotID layer can now import it
  from `@ingram-tech/nk-forms` and drop their direct `@ingram-tech/bot-protection`
  dependency entirely.

## 0.2.0

### Minor Changes

- a72c2f3: Add `@ingram-tech/nk-forms`: the contact/signup submission pipeline. Composes
  `bot-protection` (honeypot + timing token + Vercel BotID) and `nk-email`
  (sending + `escapeHtml`) behind one `handleFormSubmission` handler, a
  `renderNotificationEmail` builder that escapes every value, a `mintFormToken`
  GET handler, and a `useFormSubmit` client hook. Sites keep their own schema,
  fields, and delivery; the package owns the pipeline and its safety defaults
  (silent bot-drop, escaped notifications, optional rate-limit hook).
