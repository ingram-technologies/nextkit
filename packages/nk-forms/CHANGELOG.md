# @ingram-tech/nk-forms

## 0.3.1

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

## 0.3.0

### Minor Changes

- bdc28df: Absorb `@ingram-tech/bot-protection` into nk-forms. Nothing in the fleet
  depended on it directly — nk-forms was its only consumer and already re-exported
  its whole surface — so the separate package bought a second version number,
  changelog and release for 600 lines that were already an implementation detail.
  
  Additive for nk-forms: `verifyHuman`, `checkBot`, `createFormToken`,
  `verifyFormToken`, `HONEYPOT_FIELD`, `TOKEN_FIELD` and `isConfigured` now come
  from the root, with `<HoneypotField>` at `/honeypot` and the field names at
  `/fields`. `BOT_PROTECTION_SECRET` keeps its name, so no site config changes.
  `botid` becomes an optional peer dependency of nk-forms.
  
  Sites importing `@ingram-tech/bot-protection` directly (none known) should
  switch the specifier to `@ingram-tech/nk-forms`; that package is deprecated on
  npm.

## 0.2.7

### Patch Changes

- 9262afb: Publish `src/` alongside `dist/`, so the emitted `.js.map` and `.d.ts.map` files
  resolve. Bundlers no longer warn that "sourcemap points to missing source
  files", stack traces map back to real TypeScript, and go-to-definition lands on
  the annotated source instead of a generated `.d.ts`. Tests are excluded from the
  tarball.
- Updated dependencies [9262afb]
  - @ingram-tech/bot-protection@0.4.2
  - @ingram-tech/nk-email@0.6.1

## 0.2.6

### Patch Changes

- Updated dependencies [71e49b2]
  - @ingram-tech/nk-email@0.6.0
  - @ingram-tech/bot-protection@0.4.1

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
