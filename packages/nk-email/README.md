# @ingram-tech/nk-email

Zero-dependency [Cloudflare Email Sending](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/)
client — the one shared email client for Ingram sites.

## Install

```bash
bun add @ingram-tech/nk-email
```

## Environment

This package owns its own env contract (see `src/keys.ts`):

| Variable | Description |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Account that owns the sending domain |
| `CLOUDFLARE_EMAIL_API_TOKEN` | Token with Email Sending permission |
| `EMAIL_FROM_DOMAIN` | Verified sending domain, e.g. `mail.example.com` |

## Use

```ts
import { sendEmail, fromAddress } from "@ingram-tech/nk-email";

await sendEmail({
	to: "customer@example.com",
	from: fromAddress("Acme Studio", "hello"),
	replyTo: "studio@example.com",
	subject: "Your booking is confirmed",
	html: "<p>See you Saturday!</p>",
	text: "See you Saturday!",
});
```

Supports `cc`, `bcc`, `attachments`, and custom `headers`.

### One-click unsubscribe (RFC 8058)

Any non-transactional send — a newsletter issue, a post-signup lifecycle nudge —
must carry `List-Unsubscribe` headers for Gmail/Yahoo bulk-sender compliance and
deliverability. Pass `listUnsubscribe` and the header pair is generated for you:

```ts
await sendEmail({
	to: "customer@example.com",
	from: fromAddress("Acme", "news"),
	subject: "What's new",
	html,
	text,
	listUnsubscribe: {
		url: "https://acme.com/u?token=…", // one-click POST target, unauthenticated + idempotent
		mailto: "news@mail.acme.com",      // optional fallback
	},
});
```

The standalone `buildListUnsubscribeHeaders({ url, mailto })` is exported for
callers that assemble headers themselves. For the full subscription / lifecycle
machinery (contacts, consent, dedup, rendering) reach for
[`@ingram-tech/nk-marketing`](../nk-marketing), which builds on this.

### Escaping

`escapeHtml(value)` escapes the five HTML-significant characters — use it when
interpolating any user-controlled text into an HTML email body.

### Fail fast / degrade gracefully

```ts
import { keys, isConfigured } from "@ingram-tech/nk-email";

keys();          // throws listing every missing env var — call at startup
isConfigured();  // boolean — skip sending in local/dev instead of throwing
```

## Design

- **Zero dependencies** beyond `fetch`. No SDK, no Node-only APIs — runs on
  Vercel Functions, the edge, or anywhere `fetch` exists.
- **`from` is required and explicit.** Build it with `fromAddress()` so the
  sender domain comes from `EMAIL_FROM_DOMAIN`, never hard-coded.
