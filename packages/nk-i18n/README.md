# @ingram-tech/nk-i18n

Type-safe, English-as-key i18n for Ingram Next.js sites. The English source text
**is** the key (no `en.json`), translations are ICU MessageFormat, and catalogs
are plain colocated JSON. Routing is left to the site — the translator only needs
a locale string, so it works with URL-prefixed (`/fr/…`, `[locale]`, middleware
rewrite) or cookieless (cookie + `Accept-Language`) setups alike.

```bash
bun add @ingram-tech/nk-i18n
```

## Locale config (one table, derived constants)

```ts
// lib/i18n/locales.ts
import { defineI18nConfig, deriveLocaleConstants, localeMap } from "@ingram-tech/nk-i18n";

export const i18nConfig = defineI18nConfig({
	baseLocale: "en",
	locales: {
		en: { label: "English", htmlLang: "en", ogLocale: "en_US" },
		fr: { label: "Français", htmlLang: "fr-BE", ogLocale: "fr_BE" },
		nl: { label: "Nederlands", htmlLang: "nl-BE", ogLocale: "nl_BE" },
	},
});

export type Locale = keyof typeof i18nConfig.locales & string;
export const { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_NAMES } =
	deriveLocaleConstants(i18nConfig);
export const HTML_LANG = localeMap(i18nConfig, (def) => def.htmlLang);
export const OG_LOCALE = localeMap(i18nConfig, (def) => def.ogLocale);
```

## Translating

Server components / metadata:

```ts
import { createT } from "@ingram-tech/nk-i18n";
import { siteScope } from "@/lib/i18n/scopes/site";

const t = createT(locale, siteScope);
t("Back to directory");
t('Results for "{query}"', { query });
t("Showing {from}-{to} of {total, number} codes", { from, to, total });
```

Client components:

```tsx
"use client";
import { useT } from "@ingram-tech/nk-i18n/client";
import fr from "./i18n.fr.json";
import nl from "./i18n.nl.json";

const t = useT({ fr, nl });
```

When the source is a concrete scope or `{ fr, nl }`, `t("…")` is **type-checked**
against the intersection of the catalogs — a missing translation is a compile
error, not a silent English fallback. For data-driven keys (a runtime `string`),
widen the source: `useT<Messages>({ fr, nl })`.

### Scopes

```ts
// lib/i18n/scopes/site.ts
import { defineI18nScope } from "@ingram-tech/nk-i18n";
import fr from "../messages/site.fr.json";
import nl from "../messages/site.nl.json";

export const siteScope = defineI18nScope({ name: "site", messages: { fr, nl } });
```

## Locale provider & resolution

Wrap the app once with the server-resolved locale:

```tsx
// app/layout.tsx
import { LocaleProvider } from "@ingram-tech/nk-i18n/client";

<LocaleProvider value={locale}>{children}</LocaleProvider>;
```

Read it in client components (pass the site's `Locale` to narrow it):

```ts
import { useLocale } from "@ingram-tech/nk-i18n/client";
const locale = useLocale<Locale>();
```

For a site that encodes the locale in the URL, use **locale routing** (next
section) rather than hand-rolling this. Otherwise, resolve however the site
routes; `negotiateAcceptLanguage` handles the `Accept-Language` step:

```ts
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { negotiateAcceptLanguage } from "@ingram-tech/nk-i18n";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "./locales";

export const resolveLocale = cache(async (): Promise<Locale> => {
	const cookie = (await cookies()).get("locale")?.value;
	if (cookie && (SUPPORTED_LOCALES as string[]).includes(cookie)) return cookie as Locale;
	const negotiated = negotiateAcceptLanguage(
		(await headers()).get("accept-language"),
		SUPPORTED_LOCALES,
	);
	return (negotiated as Locale) ?? DEFAULT_LOCALE;
});
```

## Locale URL routing

One definition of how a locale is encoded in a URL, shared by the code that
**serves** a language and the code that **advertises** it to search engines. When
those two drift — the classic being middleware that redirects away the very
`?hl=` URLs hreflang points at — the site tells Google the French page lives at
an address that doesn't serve French, and Google drops the language. Nothing
catches that, because neither half can see the other.

```ts
// lib/i18n/routing.ts
import { defineLocaleRouting } from "@ingram-tech/nk-i18n";

export const routing = defineLocaleRouting({
	baseUrl: "https://example.com",
	locales: ["en", "fr", "nl"],
	defaultLocale: "en",
	// strategy: "query" (default) → /pricing?hl=fr, bare path is x-default
	// strategy: "prefix"          → /fr/pricing, default locale stays bare
	countryLocales: { FR: "fr", NL: "nl" }, // omit BE: geography can't decide
});
```

**The rule: a URL that names a locale serves that locale, with a 200, to
everybody.** Never redirect it.

```ts
// proxy.ts — forward, never redirect
import { forwardUrlLocale } from "@ingram-tech/nk-i18n/next";

export function proxy(request: NextRequest) {
	const requestHeaders = new Headers(request.headers);
	forwardUrlLocale(routing, request.nextUrl, requestHeaders);
	return NextResponse.next({ request: { headers: requestHeaders } });
}
```

```ts
// lib/i18n/locale.ts
import { createLocaleResolver } from "@ingram-tech/nk-i18n/next";

export const resolveLocale = cache(
	createLocaleResolver(routing, { account: () => getProfile().locale }),
);
```

The precedence is fixed and not configurable:

1. **the URL** (`?hl=fr`) 2. account setting 3. cookie 4. `Accept-Language`
5. country 6. `defaultLocale`

The URL beating the account setting is the load-bearing part: a shared link must
show the recipient the language it names, or every localized link the site ships
is a lie. Suppliers are lazy, so a `?hl=` request never touches the database.

For hreflang, hand the same object to nk-seo — `hreflangConfigFor` sets
`currentLocale` from the **URL**, so canonicals follow the address rather than
whatever language negotiation rendered:

```tsx
// app/layout.tsx
import { hreflangConfigFor } from "@ingram-tech/nk-i18n/next";
import { HreflangLinks } from "@ingram-tech/nk-seo/components";

<HreflangLinks {...(await hreflangConfigFor(routing))} pathname={pathname} />;
```

The language switcher must be real `<a href={routing.urlForLocale(path, loc)}>`
links: hreflang is an annotation, not a discovery mechanism, so a button calling
a server action gives a crawler no path to the other languages.

Prove the site serves what it advertises with `assertHreflangCluster` from
`@ingram-tech/nk-seo/verify`. Full rationale in
[`docs/i18n-routing.md`](../../docs/i18n-routing.md).

## Exports

- `@ingram-tech/nk-i18n` (server-safe, no React): `createT`, `defineI18nScope`,
  `defineMessages`, `defineI18nConfig`, `deriveLocaleConstants`, `localeMap`,
  `negotiateAcceptLanguage`, `defineLocaleRouting`, `LOCALE_PRECEDENCE`,
  `resolveLocaleFromSignals`, `resolveLocaleFromSuppliers`, and the `Messages` /
  `I18nScope` / `Translator` / `TranslationKey` / `I18nConfig` /
  `LocaleDefinition` / `LocaleRouting` / `LocaleSignals` types.
- `@ingram-tech/nk-i18n/client` (`"use client"`): `LocaleProvider`, `useLocale`,
  `useT`.
- `@ingram-tech/nk-i18n/next` (server, needs `next`): `forwardUrlLocale`,
  `getUrlLocale`, `createLocaleResolver`, `hreflangConfigFor`,
  `LOCALE_URL_HEADER`.
