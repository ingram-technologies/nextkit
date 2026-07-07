# @ingram-tech/bot-protection

Invisible, layered bot protection for forms — no CAPTCHA. Three layers, cheapest
first:

1. **Honeypot** — a hidden field real users never fill; bots do. Zero-dep.
2. **Signed timing token** — an HMAC-signed timestamp; rejects submissions that
   arrive implausibly fast or stale. Zero-dep (`node:crypto`).
3. **Vercel BotID** — optional, invisible server check. Degrades to a no-op when
   `botid` isn't installed or you're off Vercel.

## Install

```bash
bun add @ingram-tech/bot-protection
# optional, for layer 3:
bun add botid
```

Set `BOT_PROTECTION_SECRET` (e.g. `openssl rand -hex 32`). To rotate it, set a
comma-separated list (`new,old`): tokens sign with the first secret and verify
against all of them, so in-flight forms keep working; drop the old one after
the token window (1h) has passed.

## Use

**Render the form** (token is minted server-side):

```tsx
import { createFormToken } from "@ingram-tech/bot-protection";
import { HoneypotField } from "@ingram-tech/bot-protection/honeypot";

// The page that mints the token MUST render per-request. On a statically
// prerendered (or ISR/cached) page the timestamp is the BUILD time: once the
// deploy is older than the token window (default 1h), every real submission
// verifies as "expired" and is silently dropped.
export const dynamic = "force-dynamic";

export default function ContactPage() {
	const token = createFormToken(); // server component / server-side
	return (
		<form action="/api/contact" method="post">
			{/* ...your real fields... */}
			<HoneypotField token={token} />
			<button type="submit">Send</button>
		</form>
	);
}
```

Prefer keeping the page static? Mint the token from a route handler instead
and fetch it client-side — that's exactly what the `/react` hook does (below).

**Verify on submit** (API route or server action):

```ts
import { verifyHuman } from "@ingram-tech/bot-protection";

export async function POST(request: Request) {
	const formData = await request.formData();
	const result = await verifyHuman({ formData });
	if (!result.ok) {
		// Silently drop — respond 200 without acting, so bots aren't told why.
		return Response.json({ ok: true });
	}
	// ...send the email / save the lead...
	return Response.json({ ok: true });
}
```

`verifyHuman` also accepts a plain object (`{ formData: { ...fields } }`) and a
`timing` window (`{ minMs, maxMs }`). Pass `botid: false` to skip layer 3.

### Client forms (JSON POST)

For client components that POST JSON instead of a server-rendered `<form>`, use
the `/react` hook. It fetches the token from your route's `GET` on mount and
hands you the fields to merge into the body. The route's `GET` returns the
token; its `POST` verifies:

```tsx
"use client";
import { HoneypotInput, useBotProtection } from "@ingram-tech/bot-protection/react";

export function ContactForm() {
	// `ready` flips true once the token fetch resolves — gate the submit button
	// on it if you don't want early submissions treated as bot-ish.
	const { honeypotRef, botFields, ready } = useBotProtection("/api/contact");

	async function onSubmit(values: FormValues) {
		await fetch("/api/contact", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ ...values, ...botFields() }),
		});
	}
	return (
		<form onSubmit={/* ... */}>
			{/* ...your real fields... */}
			<HoneypotInput inputRef={honeypotRef} />
		</form>
	);
}
```

```ts
// app/api/contact/route.ts
import { createFormToken, verifyHuman } from "@ingram-tech/bot-protection";

// Same freshness rule as above: the GET must not be cached, or the token
// ages with the cache entry and eventually expires every submission.
export const dynamic = "force-dynamic";

export const GET = () => Response.json({ token: createFormToken() });

export async function POST(request: Request) {
	const body = await request.json();
	const result = await verifyHuman({ formData: body });
	if (!result.ok) return Response.json({ ok: true }); // silently drop
	// ...send the email / save the lead...
	return Response.json({ ok: true });
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

## Vercel BotID wiring (per app, layer 3 only)

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

## Why "silently drop"?

Returning success without acting (rather than a 4xx) avoids teaching spam tools
which layer caught them — which is what makes them give up.
