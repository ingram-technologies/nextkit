# @ingram-tech/nk-forms

A submission pipeline for public contact and signup forms: bot protection,
validation, a rate-limit hook, and escaped email notifications behind one server
handler and one client hook.

It owns the bot-protection layers and builds on
[`@ingram-tech/nk-email`](../nk-email) for sending and `escapeHtml`. It covers
the "validate a public submission and notify a human / subscribe an address"
shape, and does not try to own Stripe checkout or auth flows. For bot detection
somewhere that isn't a public form, call `verifyHuman` or `checkBot` directly
(see [Bot protection](#bot-protection)).

## What it gives you

- `handleFormSubmission(request, options)` — the fixed pipeline: rate-limit →
  parse → bot gate → validate → deliver → uniform response. Bot hits and honest
  submissions return the same 200 body, so a bot never learns it was dropped.
  Returns a web-standard `Response` (no `next` dependency).
- `renderNotificationEmail({ heading, fields, message, footer })` — builds
  `{ html, text }` with every value escaped.
- `mintFormToken()` — a ready-made GET handler for the signed timing token.
- `useFormSubmit(endpoint)` / re-exported `useBotProtection` + `HoneypotInput`
  from `@ingram-tech/nk-forms/react`.

You still own your schema (a Zod schema, accepted structurally, so no Zod
version pin), your fields and branding, and your delivery (`onSubmit`).

## Route

```ts
// app/api/contact/route.ts
import { handleFormSubmission, renderNotificationEmail } from "@ingram-tech/nk-forms";
import { fromAddress, sendEmail } from "@ingram-tech/nk-email";
import { z } from "zod";

export { mintFormToken as GET } from "@ingram-tech/nk-forms";

const schema = z.object({
	name: z.string().trim().min(1).max(200),
	email: z.string().trim().email().max(320),
	message: z.string().trim().min(1).max(5000),
});

export const POST = (request: Request) =>
	handleFormSubmission(request, {
		schema,
		label: "contact",
		onSubmit: async ({ name, email, message }) => {
			const { html, text } = renderNotificationEmail({
				heading: "New contact form submission",
				fields: [
					{ label: "Name", value: name },
					{ label: "Email", value: email },
				],
				message,
				footer: "Sent from the acme.test contact form.",
			});
			await sendEmail({
				to: "studio@acme.test",
				from: fromAddress("Acme"),
				replyTo: email,
				subject: `[Contact] ${name}`,
				html,
				text,
			});
		},
	});
```

Add a rate limiter by passing `rateLimit: () => ({ ok, retryAfterMs })`, backed
by whatever store you already use. nk-forms owns none.

## Client

```tsx
"use client";
import { HoneypotInput, useFormSubmit } from "@ingram-tech/nk-forms/react";

export function ContactForm() {
	const { honeypotRef, submit, status, error } = useFormSubmit("/api/contact");

	return (
		<form
			onSubmit={async (e) => {
				e.preventDefault();
				const data = new FormData(e.currentTarget);
				await submit(Object.fromEntries(data));
			}}
		>
			<HoneypotInput inputRef={honeypotRef} />
			{/* your fields */}
			<button disabled={status === "submitting"}>Send</button>
			{status === "success" && <p>Thanks — we'll be in touch.</p>}
			{error && <p role="alert">{error}</p>}
		</form>
	);
}
```

## Bot protection

Three invisible layers, no CAPTCHA, run cheapest-first by `verifyHuman` (which
`handleFormSubmission` calls for you):

1. **Honeypot** — a hidden field real users never fill; bots do. Zero-dep.
2. **Signed timing token** — an HMAC-signed timestamp; rejects submissions that
   arrive implausibly fast or stale. Zero-dep (`node:crypto`).
3. **Vercel BotID** — optional, invisible server check. Degrades to a no-op when
   `botid` isn't installed or you're off Vercel.

A failure means silently drop: respond 200 without acting, so spam tools never
learn which layer caught them and a real user never sees an error.

### Using the layers directly

For bot detection outside the form pipeline, import them from the root:

```ts
import { checkBot, createFormToken, verifyHuman } from "@ingram-tech/nk-forms";
```

`verifyHuman({ formData })` takes a `FormData` or a plain object, an optional
`timing` window (`{ minMs, maxMs }`), and `botid: false` to skip layer 3.
`checkBot()` is layer 3 on its own.

### Server-rendered forms

For a plain `<form method="post">` rather than a JSON POST, mint the token
server-side and drop in `<HoneypotField>`:

```tsx
import { createFormToken } from "@ingram-tech/nk-forms";
import { HoneypotField } from "@ingram-tech/nk-forms/honeypot";

// The page that mints the token MUST render per-request. On a statically
// prerendered (or ISR/cached) page the timestamp is the BUILD time: once the
// deploy is older than the token window (default 1h), every real submission
// verifies as "expired" and is silently dropped. The same rule applies to the
// GET that `mintFormToken` backs.
export const dynamic = "force-dynamic";

export default function ContactPage() {
	const token = createFormToken();
	return (
		<form action="/api/contact" method="post">
			{/* ...your real fields... */}
			<HoneypotField token={token} />
			<button type="submit">Send</button>
		</form>
	);
}
```

The honeypot field defaults to a name browsers and password managers won't
autofill (filling it would falsely flag real users). If that default collides
with a real field in your form, override it on both sides — they must match:

```tsx
<HoneypotField token={token} field="subject_trap" />
// ...and on the server:
await verifyHuman({ formData, honeypotField: "subject_trap" });
```

### Vercel BotID wiring (per app, layer 3 only)

```ts
// next.config.ts
import { withBotId } from "botid/next/config";
export default withBotId({ /* your config */ });
```

```ts
// instrumentation-client.ts
import { initBotId } from "botid/client/core";
initBotId({ protect: [{ path: "/api/contact", method: "POST" }] });
```

## Environment

`BOT_PROTECTION_SECRET` keys the signed timing token (e.g. `openssl rand -hex
32`). Without it that layer is simply disabled; honeypot + BotID still run. To
rotate, set a comma-separated list (`new,old`): tokens sign with the first
secret and verify against all of them, so in-flight forms keep working; drop the
old one once the token window (1h) has passed.

Mail transport env comes from [`@ingram-tech/nk-email`](../nk-email).
