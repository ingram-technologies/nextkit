export type MissingKeysPolicy = "error" | "warn" | "ignore";

/**
 * Metadata for one locale. `label` (the display name, usually native) is
 * required; sites may add their own fields (e.g. `htmlLang`, `ogLocale`) and
 * read them back type-safely with {@link localeMap}.
 */
export type LocaleDefinition = {
	label: string;
	missingKeys?: MissingKeysPolicy;
};

export type I18nConfig<
	TLocales extends Record<string, LocaleDefinition> = Record<
		string,
		LocaleDefinition
	>,
	TBaseLocale extends string = string,
> = {
	baseLocale: TBaseLocale;
	locales: TLocales;
};

type AnyI18nConfig = {
	baseLocale: string;
	locales: Record<string, LocaleDefinition>;
};

/**
 * Identity helper that captures the locale table as literal types. Declare the
 * `Locale` union from the result: `type Locale = keyof typeof config.locales`.
 * Extra per-locale fields beyond `label`/`missingKeys` are preserved.
 */
export function defineI18nConfig<const TConfig extends AnyI18nConfig>(
	config: TConfig,
): TConfig {
	return config;
}

/**
 * Derive the common runtime constants from a config: the ordered locale list,
 * the base locale, and the code→label map.
 */
export function deriveLocaleConstants<const TConfig extends AnyI18nConfig>(
	config: TConfig,
): {
	SUPPORTED_LOCALES: Array<keyof TConfig["locales"] & string>;
	DEFAULT_LOCALE: TConfig["baseLocale"];
	// Preserve each locale's literal `label` type so labels can themselves be
	// used as translation keys (e.g. `t(LOCALE_NAMES[loc])`).
	LOCALE_NAMES: {
		[K in keyof TConfig["locales"] & string]: TConfig["locales"][K]["label"];
	};
} {
	type Locale = keyof TConfig["locales"] & string;
	const entries = Object.entries(config.locales) as Array<[Locale, LocaleDefinition]>;
	return {
		SUPPORTED_LOCALES: entries.map(([locale]) => locale),
		DEFAULT_LOCALE: config.baseLocale,
		LOCALE_NAMES: Object.fromEntries(
			entries.map(([locale, def]) => [locale, def.label]),
		) as {
			[K in Locale]: TConfig["locales"][K]["label"];
		},
	};
}

/**
 * Build a `Record<Locale, T>` from the config — e.g. an `HTML_LANG` or
 * `OG_LOCALE` map from fields stored on each locale definition:
 *
 *   export const HTML_LANG = localeMap(i18nConfig, (def) => def.htmlLang);
 */
export function localeMap<const TConfig extends AnyI18nConfig, TValue>(
	config: TConfig,
	pick: (
		def: TConfig["locales"][keyof TConfig["locales"] & string],
		locale: keyof TConfig["locales"] & string,
	) => TValue,
): Record<keyof TConfig["locales"] & string, TValue> {
	type Locale = keyof TConfig["locales"] & string;
	const entries = Object.entries(config.locales) as Array<
		[Locale, TConfig["locales"][Locale]]
	>;
	return Object.fromEntries(
		entries.map(([locale, def]) => [locale, pick(def, locale)]),
	) as Record<Locale, TValue>;
}
