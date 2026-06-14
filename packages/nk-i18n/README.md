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

Resolve the locale on the server however the site routes. `negotiateAcceptLanguage`
handles the `Accept-Language` step:

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

## Exports

- `@ingram-tech/nk-i18n` (server-safe, no React): `createT`, `defineI18nScope`,
  `defineMessages`, `defineI18nConfig`, `deriveLocaleConstants`, `localeMap`,
  `negotiateAcceptLanguage`, and the `Messages` / `I18nScope` / `Translator` /
  `TranslationKey` / `I18nConfig` / `LocaleDefinition` types.
- `@ingram-tech/nk-i18n/client` (`"use client"`): `LocaleProvider`, `useLocale`,
  `useT`.
