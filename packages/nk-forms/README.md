# @ingram-tech/nk-forms

The contact/signup **submission pipeline** for Ingram's Next.js sites: bot
protection, validation, rate-limit hook, and escaped email notifications behind
one server handler and one client hook.

It is a thin layer over [`@ingram-tech/bot-protection`](../bot-protection)
(the security primitive) and [`@ingram-tech/nk-email`](../nk-email) (sending +
`escapeHtml`). Reach for those directly when you need bot detection somewhere
that isn't a public form (a checkout, an authed endpoint) — this package is for
the "validate a public submission and notify a human / subscribe an address"
shape, and deliberately does **not** try to own Stripe checkout or auth flows.

## What it gives you

- `handleFormSubmission(request, options)` — the fixed pipeline: rate-limit →
  parse → bot gate → validate → deliver → uniform response. Bot hits and honest
  submissions return the **same** 200 body, so a bot never learns it was
  dropped. Returns a web-standard `Response` (no `next` dependency).
- `renderNotificationEmail({ heading, fields, message, footer })` — builds
  `{ html, text }` with **every** value escaped. Use it so escaping is the
  default, not a per-site coin flip.
- `mintFormToken()` — a ready-made GET handler for the signed timing token.
- `useFormSubmit(endpoint)` / re-exported `useBotProtection` + `HoneypotInput`
  from `@ingram-tech/nk-forms/react`.

You still own your **schema** (a Zod schema — accepted structurally, no Zod
version pin), your **fields/branding**, and your **delivery** (`onSubmit`).

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

Add a rate limiter by passing `rateLimit: () => ({ ok, retryAfterMs })` — plug in
whatever store you already use; nk-forms owns none.

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

## Environment

Inherits `BOT_PROTECTION_SECRET` from `@ingram-tech/bot-protection` (the timing
layer; honeypot + BotID run without it) and the mail transport env from
`@ingram-tech/nk-email`. This package reads no env of its own.
