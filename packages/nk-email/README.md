# @ingram-tech/nk-email

Zero-dependency [Cloudflare Email Sending](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/)
client. The canonical version of a helper that had drifted into separate copies
across Ingram sites — now one package, with every feature those copies grew.

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
	from: fromAddress("Malina More Studio", "hello"),
	replyTo: "studio@example.com",
	subject: "Your booking is confirmed",
	html: "<p>See you Saturday!</p>",
	text: "See you Saturday!",
});
```

Supports `cc`, `bcc`, `attachments`, and custom `headers` (e.g. RFC 8058
`List-Unsubscribe` for newsletters).

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
