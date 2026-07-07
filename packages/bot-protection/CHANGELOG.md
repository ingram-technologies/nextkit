# @ingram-tech/bot-protection

## 0.4.0

### Minor Changes

- 61a56ef: Keep the "never punish real users" promise under failure modes:

  - **The `/react` hook no longer fails closed against real users.** A transiently failed token fetch left the token empty forever, so the server silently dropped a real user's submission. The fetch now validates the response shape and retries once, and the hook returns a `ready` flag so forms can gate submission on the token having resolved. `useBotProtection` also accepts `honeypotField` and `<HoneypotInput>` a `name` prop, so JSON forms can override the trap name like the server side always could.
  - **The BotID degrade path is observable.** Bundler file-tracing can exclude `botid/server` from a deployed function (nothing imports it statically), and the bare `catch {}` made a permanently disabled layer 3 indistinguishable from "no bots today". The degrade now logs one warning per process, and a malformed `checkBotId` result is handled defensively.
  - **Secret rotation without dropped forms.** `BOT_PROTECTION_SECRET` accepts a comma-separated list — tokens sign with the first secret and verify against all, so rotating no longer invalidates up-to-an-hour of in-flight forms (whose submissions were silently dropped).
  - **README documents the static-prerender hazard.** The canonical example minted the token in a server component with no dynamic API access, so Next statically prerenders it and the timestamp is the _build_ time — an hour after deploy, every legitimate submission verified as "expired" and vanished. Both the page and the token-GET examples now carry `force-dynamic` and an explanation.

## 0.3.2

### Patch Changes

- 32d5e95: Emit valid Node ESM. The package is `"type": "module"` but its `dist/*.js`
  shipped extensionless relative imports (`from "./fields"`), which the shared
  base tsconfig's `moduleResolution: "bundler"` tolerates and emits verbatim —
  invalid under Node ESM and Turbopack, and a recurring source of "Cannot find
  module './x'" / `ERR_MODULE_NOT_FOUND` when the package is imported or
  resolution-checked. Added explicit `.js` extensions to all relative imports and
  switched the package's own build to `module`/`moduleResolution: "nodenext"`, so
  tsc now errors (TS2835) on any extensionless relative import — the defect can't
  silently return.

## 0.3.1

### Patch Changes

- 3904231: Clarify in the timing-token docs that it is a _timing-window_ gate, not a
  per-submission nonce: a token can be replayed within its `[minMs, maxMs]` window,
  so it composes with the honeypot and BotID layers rather than providing single-use
  semantics on its own.

## 0.3.0

### Minor Changes

- 26e6d73: Add a `/react` client export: `useBotProtection(tokenEndpoint)` + `HoneypotInput`, for client components that POST JSON to their own route. Replaces the hand-copied `src/lib/bot-protection.tsx` that had been duplicated across sites, keeping the honeypot field name and timing token in lockstep with the server verifier.

## 0.2.0

### Minor Changes

- 70ed006: Add @ingram-tech/bot-protection: invisible layered form bot protection — honeypot
  - HMAC-signed timing token + optional Vercel BotID, with a "silently drop"
    verdict model.
- ddbac3b: Make the honeypot field name configurable and change the default from
  `company_url` to `contact_detail`.

  `company_url` collided with browser / password-manager autofill (both `company`
  and `url` are autofill categories), so it got filled for real users and their
  submissions were silently dropped with `reason: honeypot`. The new default
  avoids autofill-triggering tokens, and the `<HoneypotField/>` input now also
  sets `data-1p-ignore` / `data-lpignore` / `data-form-type="other"`.

  Forms that need a name which would clash with a real field can override it by
  passing `field` to `<HoneypotField/>` and the matching `honeypotField` to
  `verifyHuman()`.
