# @ingram-tech/newsletter

> [!WARNING]
> **Deprecated — use [`@ingram-tech/nk-marketing`](../nk-marketing).** This
> package is Supabase-bound; nk-marketing is its Postgres/nk-db-native successor
> and covers the same newsletter flow (`subscribe`, `sendBroadcast`) plus
> contacts/consent and triggered lifecycle campaigns. As the fleet finishes the
> Supabase→Postgres move (see `docs/philosophy.md`), migrate to nk-marketing.
> Still published and supported for sites on Supabase, but gets no new features.

Supabase-backed newsletter subscriptions and sending, with idempotent
subscribe/resubscribe, token-based unsubscribe, and RFC 8058 one-click
unsubscribe. Sends via [`@ingram-tech/nk-email`](../nk-email) (whose `escapeHtml`
+ `buildListUnsubscribeHeaders` it now reuses rather than duplicating).

This package **owns its tables** and ships the migrations; you inject a Supabase
client and a base URL. It defines its own row types (it does not import your
generated `Database`), so it drops into any Supabase project.

## Install

```bash
bun add @ingram-tech/newsletter @supabase/supabase-js
```

## 1. Apply the schema

Copy the migrations into your `supabase/migrations` (they live in the package):

```bash
cp node_modules/@ingram-tech/newsletter/migrations/0001_newsletters.sql \
   supabase/migrations/$(date +%Y%m%d%H%M%S)_newsletters.sql
```

`0001_newsletters.sql` creates `newsletters` + `newsletter_subscriptions` (UUID
keys, RLS, indexes). Apply `0002_newsletters_auth_link.sql` **only** if your site
has user signups and you want pre-signup subscriptions back-linked to users.

Then seed a newsletter row (slug, name, from_name, from_local_part).

## 2. Use it

```ts
import { createNewsletter } from "@ingram-tech/newsletter";
import { createClient } from "@supabase/supabase-js";

const newsletter = createNewsletter({
	supabase: createClient(url, serviceRoleKey), // service-role: writes bypass RLS
	baseUrl: "https://example.com",
});

// Subscribe (idempotent) — e.g. in POST /api/newsletter/subscribe
await newsletter.subscribe({ newsletterSlug: "product-updates", email });

// Unsubscribe — e.g. in your /api/newsletter/unsubscribe route
await newsletter.unsubscribe(token);

// Send to all active subscribers (per-recipient one-click unsubscribe)
const result = await newsletter.send({
	newsletterSlug: "product-updates",
	subject: "What's new",
	content: "First line.\n\nSecond paragraph.",
	cta: { label: "Read more", href: "https://example.com/post" },
	// onlyTo: ["you@example.com"], // for a test send
});
```

Requires `@ingram-tech/nk-email`'s env (`CLOUDFLARE_*`, `EMAIL_FROM_DOMAIN`). The
sending address is `<from_local_part>@<EMAIL_FROM_DOMAIN>`.

## Rendering

The built-in renderer produces a clean, dependency-free HTML + text email.
Override it with `createNewsletter({ render })` to use your own template
(e.g. React Email).

## Not included (by design)

Open/click tracking and "view in browser" are a separate concern (a future
`email-tracking` package) — this package focuses on subscriptions + delivery.
