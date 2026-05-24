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

Set `BOT_PROTECTION_SECRET` (e.g. `openssl rand -hex 32`).

## Use

**Render the form** (token is minted server-side):

```tsx
import { createFormToken } from "@ingram-tech/bot-protection";
import { HoneypotField } from "@ingram-tech/bot-protection/honeypot";

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
