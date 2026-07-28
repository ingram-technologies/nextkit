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

### Archiving bodies (opt-in)

Metadata answers "did it land". It does not answer "**show me the exact email
this person received**" — the question an operator actually gets asked, and the
one a support thread turns on. Turn on `captureBody` and each row also carries
the rendered message in a `body` jsonb column, which is enough to drive a preview
pane straight off the log:

```ts
const mailer = createMailer({ db: pool, captureBody: true });

await mailer.send({ /* … */ });        // row.body = { html, text }

// per-send override — keep a live credential out of the archive:
await mailer.send({ ...magicLink, captureBody: false }); // metadata row still written
```

Apply `migrations/0002_email_log_extras.sql` when you turn it on. It is a separate
step because a metadata log and a message archive carry different burdens, and
**two of them become yours**:

- **Secrets.** A verification / password-reset / magic-link body contains a live
  credential. Archived, it makes read access to this table equivalent to account
  takeover. Pass `captureBody: false` on those sends, and give a body-reading
  operator surface a tighter role than a metadata-reading one.
- **Retention.** Bodies are personal data and nothing expires them for you. The
  table is append-only from the app, so purging is a job you schedule:

  ```sql
  update nk_email_log set body = null
   where body is not null and created_at < now() - interval '90 days';
  ```

  Nulling keeps the audit trail while dropping the content; delete the row
  instead if your policy covers the metadata too.

Bodies are clamped per part at `MAX_LOGGED_BODY_CHARS` (256k), and a clamped row
is marked `{"truncated": true}` so a preview can say so rather than present a
cut-off message as whole. With capture off — the default, and what nk-marketing
uses — the `body` column is left out of the insert entirely, so `0001` alone
remains a complete install.

### Linking a row to your own records

`nk_email_log` carries no foreign key into your tables — that is what lets every
site apply the same migration unchanged. Pass `meta` instead: site-defined JSON,
stored as-is in a `meta` jsonb column, which is the seam for correlating a logged
send with whatever it belongs to.

```ts
await mailer.send({
	to: person.email,
	from: fromAddress("Acme"),
	subject: "Your booking is confirmed",
	html,
	templateKey: "booking-confirmed",
	meta: { personEmailId: person.emailId, bookingId: booking.id },
});
```

```sql
select l.subject, l.status, l.created_at, p.name
  from nk_email_log l
  join people p on p.id = (l.meta->>'personEmailId')::uuid
 order by l.created_at desc;

-- if you read that way often:
create index on nk_email_log ((meta->>'personEmailId'));
```

It's a correlation key, not referential integrity: nothing stops a `meta` id from
outliving the row it names. Keep it to **ids, not payloads** — `meta` is capped at
`MAX_LOGGED_META_CHARS` (4k) serialized, and anything larger (or unserializable)
is dropped with a `console.error` rather than truncated, since half a JSON
document is not a JSON document. The send and the rest of the row are never at
risk. `meta` is independent of `captureBody` — a metadata-only log can carry it —
and, like `body`, its column stays out of the insert when unset.

**Already have a site-owned send log?** You can now fold it in — bodies and your
own join both survive the move. It is still a judgement call rather than an
upgrade path: you trade a real foreign key for a `meta` correlation, in exchange
for running one log instead of two. Nothing forces the choice; a site can keep
its own log and still write `nk_email_log` for the fleet-uniform view. See
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
which the send-log answers once `captureBody` is on. A site with an operator
surface usually wants both, and they stay consistent because each is built from
the real sender rather than a copy of it.

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
