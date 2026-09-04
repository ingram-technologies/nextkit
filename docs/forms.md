# Forms

Public contact/signup forms across the fleet all do the same handful of things —
rate-limit, drop bots, validate, notify — and drifted apart doing them (some
escaped email HTML, some didn't; some rate-limited, most didn't). That pipeline
lives in [`@ingram-tech/nk-forms`](../packages/nk-forms); use it for any public
form that validates a submission and notifies a human or subscribes an address.

## The split

- **`@ingram-tech/nk-forms`** owns the pipeline, the escaped-notification
  renderer, and the bot-protection layers themselves: honeypot + signed timing
  token + Vercel BotID (`verifyHuman`, `checkBot`, `createFormToken`, all
  exported from the root). It owns the machinery; the site owns the schema, the
  fields/branding, and the delivery.
- **`@ingram-tech/nk-email`** sends mail and owns `escapeHtml`.
- For bot detection that isn't a public form — a checkout, an authed endpoint —
  call `verifyHuman` / `checkBot` **directly** rather than routing the request
  through `handleFormSubmission`.

This is the vertical-slice rule from [`creating-a-package.md`](./creating-a-package.md)
§5: contact-form fields vary too much to ship a one-size component, so we ship
the server machinery and a headless client hook, not the UI.

## Where forms live

`/internal/forms/<name>`, served by one `createFormsHandler({ name: defineForm(…) })`
route at `app/internal/forms/[form]/route.ts`. Forms are not API: `/api/…` is
the versioned, documented contract, and a form POST has one consumer, no schema
promise and no version. The registry also removes the per-form route file — the
name gives the URL, the log label and the rate-limit namespace, so adding a form
is adding an entry, the same shape as the email catalog. Forms are the one
anonymous, browser-called route under `/internal`; they are gated by the bot
layers and the site's limiter, never by the worker secret. Client side is
`useFormSubmit(formEndpoint(name))`, so the path is written once.

## Pipeline order (fixed)

`handleFormSubmission` runs: rate-limit (429) → parse body (400) → bot gate
(silent 200) → schema validate (400) → `onSubmit` deliver (500) → success (200).

The load-bearing invariant: **a dropped bot and an accepted human get the same
200 `{ success: true }`.** Never surface the bot verdict to the client, and never
show a real user an error for tripping a layer. A `verifyHuman` failure means
"silently drop", not "reject".

## Gotchas

- **Escaping is not optional.** Interpolating `name`/`email`/`message` into email
  HTML unescaped is an injection into your own inbox. `renderNotificationEmail`
  escapes everything; if you hand-roll HTML instead, wrap every value in
  `escapeHtml` from `@ingram-tech/nk-email`.
- **Schema strips bot fields.** The honeypot (`contact_detail`) and token
  (`_bp_token`) ride in the JSON body. A default Zod object strips unknown keys,
  so `safeParse` succeeds; a `.strict()` schema would reject the submission.
- **The token GET is required.** `useBotProtection`/`useFormSubmit` fetch the
  timing token from the same endpoint they post to; `createFormsHandler` serves
  it. The token cannot be minted at render time instead: a prerendered page
  would bake a build-time timestamp into the HTML and every submission would
  expire. On a standalone route, export `mintFormToken as GET`, or the timing
  layer silently disables and only honeypot + BotID protect the form.
- **nk-forms owns no rate-limit store.** Pass the registry a `rateLimit`
  callback: it gets `{ request, form, limit, windowMs }` and returns
  `{ ok, retryAfterMs }`; key it however the site's limiter wants.
- **Not for checkout or auth.** Those diverge too much and need hard failures,
  not silent drops — call `verifyHuman`/`checkBot` directly there.
