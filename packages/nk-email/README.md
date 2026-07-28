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

### Send-log (opt-in metadata history)

`sendEmail` is fire-and-forget — it persists nothing. When you want a durable
record of *that* a message went out (an operator surface asking "what did we
send, to whom, did it land?"), build a **mailer** with a database and call `send`
where you called `sendEmail`:

```ts
import { createMailer } from "@ingram-tech/nk-email";

const mailer = createMailer({ db: pool }); // pg Pool / nk-db helper, by injection

await mailer.send({
	to: "customer@example.com",
	from: fromAddress("Acme", "hello"),
	subject: "Your booking is confirmed",
	html,
	text,
	kind: "transactional",  // or "marketing"; default "transactional"
	templateKey: "booking-confirmed", // links the row to your email catalog
});
```

Every send writes one row to `nk_email_log` (`kind`, recipient, subject, sender,
`template_key`, `campaign_key`, `message_id`, `status`, `error`, `created_at`).
It's **best-effort** — a logging outage never fails the mail — and **opt-in**:
with no `db` the mailer is a pure pass-through, so you can adopt the API first
and turn on persistence later without touching call sites. Apply
`migrations/0001_email_log.sql` (with your own migration pipeline) when you turn
logging on. `recordEmail(db, record)` is the low-level writer if you need it;
`@ingram-tech/nk-marketing` uses it to log broadcasts as `kind: "marketing"`.

**What it deliberately does not store:** the rendered body. `nk_email_log` is
**metadata only** — an audit trail, not a message archive. It cannot answer "show
me the exact email this person received", it holds no foreign key into your
`users`/`people` tables (it is a standalone, RLS-free table that any site can
apply unchanged), and it has no retention policy, because there is no message
content in it to retain.

**Already have a site-owned send log?** Keep it — do not migrate it into
`nk_email_log`. If your log stores rendered bodies, or joins to your own person
records, moving to this table is a data migration that *loses* a feature. The two
are not competitors and coexist fine: a site can run its own body-storing log
and still take `nk_email_log` for the fleet-uniform metadata view (nk-marketing
already writes there). Adopt this one when you are starting from nothing, or when
metadata is genuinely all you need. See
[transactional email conventions](../../docs/transactional-email.md#send-history-and-previews).

### Email catalog (drift-proof previews)

Declare a manifest of every message your product sends and the occasion that
triggers it, so an operator surface can preview them without reading the code.
The one rule that keeps a preview honest: **build each entry from the same
function the real sender uses**, so the previewed subject/html/text is
byte-for-byte what ships.

```ts
import { defineEmailCatalog, serializeEmailCatalog } from "@ingram-tech/nk-email";

export const catalog = defineEmailCatalog([
	{
		key: "booking-confirmed",
		group: "Bookings",
		name: "Booking confirmed",
		audience: "Customer",
		scenario: "Sent the moment a paid booking is taken.",
		// rendered from your real builder with sample data:
		...renderBookingConfirmed({ name: "Ava", when: "Saturday" }),
	},
]);

// a build/CI step writes this to a committed email-catalog.json:
serializeEmailCatalog(catalog, { product: "Acme" });
```

nk-email does no templating (you pass rendered `subject`/`html`/`text`), so an
entry already holds the final strings. The serializer emits a versioned JSON
manifest — commit it and point your operator surface at it. No route, no send,
no runtime footprint.

A catalog entry is a **sample render**, not a sent message: it shows what the
"booking confirmed" email looks like, with sample data, as of the current code.
That is a different question from "what exactly did we mail Ava on Tuesday",
which needs a body-storing log of your own — see the note above.

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
