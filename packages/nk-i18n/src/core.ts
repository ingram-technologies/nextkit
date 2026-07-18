import IntlMessageFormat from "intl-messageformat";
import type { MissingKeysPolicy } from "./config.js";

type MessageCatalog = Record<string, string>;
declare const I18N_KEY_BRAND: unique symbol;
declare const LOCALIZED_STRING_BRAND: unique symbol;

/**
 * A string that has passed through a {@link Translator} — display-ready text in
 * the active locale. It is a plain `string` at runtime (the brand is erased), so
 * it flows anywhere a `string` is wanted; the brand only matters where a prop is
 * tightened to require `LocalizedString`, which turns hardcoded English at that
 * boundary into a compile error. Sites that need to pass deliberately
 * untranslated text (a name, an id, a number) opt out with `x as LocalizedString`.
 */
export type LocalizedString = string & {
	readonly [LOCALIZED_STRING_BRAND]: "LocalizedString";
};

/**
 * A set of per-locale message catalogs, keyed by locale code. The English
 * source text is used as the key, so there is no `en` catalog: a missing lookup
 * falls back to the key itself.
 */
export type Messages = Record<string, MessageCatalog>;

type I18nKey<TValue extends string = string> = TValue & {
	readonly [I18N_KEY_BRAND]: "I18nKey";
};

/** A named bundle of catalogs, produced by {@link defineI18nScope}. */
export type I18nScope<TMessages extends Messages = Messages> = {
	readonly name: string;
	readonly messages: TMessages;
};

export type MessageSource<TMessages extends Messages = Messages> =
	| TMessages
	| I18nScope<TMessages>;

type SharedMessageKey<TMessages extends Messages> = keyof TMessages[keyof TMessages] &
	string;
type KnownMessageKey<TSource extends MessageSource> =
	TSource extends I18nScope<infer TMessages>
		? SharedMessageKey<TMessages>
		: TSource extends Messages
			? SharedMessageKey<TSource>
			: never;
type Unbrand<TValue extends string> =
	TValue extends I18nKey<infer TRaw> ? TRaw : TValue;
type LiteralString<TValue extends string> = string extends TValue ? never : TValue;
type SafeLiteralOrKey<TValue extends string> =
	TValue extends I18nKey<string> ? TValue : LiteralString<TValue>;

export type TranslationKey<TSource extends MessageSource> = KnownMessageKey<TSource>;

type AllowedMessageKey<
	TSource extends MessageSource | undefined,
	TValue extends string,
> = TSource extends MessageSource
	? Unbrand<TValue> extends KnownMessageKey<TSource>
		? TValue
		: KnownMessageKey<TSource>
	: SafeLiteralOrKey<TValue>;

type DeepMessageKeys<TValue> = TValue extends string
	? I18nKey<TValue>
	: TValue extends (...args: never[]) => unknown
		? TValue
		: TValue extends readonly unknown[]
			? { readonly [K in keyof TValue]: DeepMessageKeys<TValue[K]> }
			: TValue extends Record<PropertyKey, unknown>
				? { [K in keyof TValue]: DeepMessageKeys<TValue[K]> }
				: TValue;

/**
 * Translate an English source string to the active locale. With a known message
 * source the key is checked against the catalogs at compile time; without one,
 * any literal string is allowed. The optional `values` are interpolated with
 * ICU MessageFormat (`{name}`, `{count, number}`, plurals, …).
 *
 * The return is branded {@link LocalizedString} so a prop can require translated
 * text; interpolation done here stays branded, but composing with `+` or a
 * template literal collapses back to a plain `string`.
 */
export type Translator<TSource extends MessageSource | undefined = undefined> = <
	const TValue extends string,
>(
	english: AllowedMessageKey<TSource, TValue>,
	values?: Record<string, unknown>,
) => LocalizedString;

const cache = new Map<string, IntlMessageFormat>();
// Bound the formatter cache: keys embed the locale, and an unvalidated
// user-controlled locale (cookie/path segment) would otherwise grow server
// memory without limit.
const CACHE_MAX = 5000;

const warnedFormatErrors = new Set<string>();
const warnedMissingKeys = new Set<string>();

/** Apply a locale's {@link MissingKeysPolicy} when a catalog lookup misses.
 *  `"error"` throws; `"warn"` logs once per locale+key; `"ignore"` is silent.
 *  The caller falls back to the English key regardless (except when thrown). */
function reportMissingKey(
	key: string,
	locale: string,
	policy: MissingKeysPolicy,
): void {
	if (policy === "ignore") return;
	const message = `@ingram-tech/nk-i18n: missing "${locale}" translation for "${key}"`;
	if (policy === "error") throw new Error(message);
	const dedupe = `${locale}:${key}`;
	if (!warnedMissingKeys.has(dedupe)) {
		warnedMissingKeys.add(dedupe);
		console.warn(message);
	}
}

function format(
	message: string,
	locale: string,
	values: Record<string, unknown>,
): string {
	try {
		const key = `${locale}:${message}`;
		let fmt = cache.get(key);
		if (!fmt) {
			if (cache.size >= CACHE_MAX) cache.clear();
			fmt = new IntlMessageFormat(message, locale);
			cache.set(key, fmt);
		}
		const result = fmt.format(values);
		return typeof result === "string" ? result : String(result);
	} catch (error) {
		// A malformed catalog entry, a missing placeholder value, or a bad
		// locale tag must degrade to the raw message — not 500 every page that
		// renders this key in this locale (which base-locale testing never hits,
		// since values-less lookups return early).
		if (!warnedFormatErrors.has(message)) {
			warnedFormatErrors.add(message);
			console.warn(
				`@ingram-tech/nk-i18n: failed to format "${message}" (${locale}): ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
		return message;
	}
}

function isI18nScope(source: MessageSource): source is I18nScope {
	return (
		typeof source === "object" &&
		source !== null &&
		"name" in source &&
		typeof source.name === "string" &&
		"messages" in source
	);
}

function resolveMessages(source?: MessageSource): Messages | undefined {
	if (!source) return undefined;
	return isI18nScope(source) ? source.messages : source;
}

/**
 * Brand a tree of English source strings as translation keys so the compiler
 * can check them. Returns the value unchanged at runtime.
 */
export function defineMessages<const TValue>(value: TValue): DeepMessageKeys<TValue> {
	return value as DeepMessageKeys<TValue>;
}

/** Group catalogs under a name so they can be passed to {@link createT}/`useT`. */
export function defineI18nScope<const TMessages extends Messages>(scope: {
	name: string;
	messages: TMessages;
}): I18nScope<TMessages> {
	return scope;
}

/** Options for {@link createT}. */
export interface CreateTOptions {
	/**
	 * What to do when the active locale's catalog has no entry for a key. Pass
	 * the locale's {@link MissingKeysPolicy} (e.g.
	 * `config.locales[locale].missingKeys`). Defaults to `"ignore"`. Only pass a
	 * non-`ignore` policy for locales that actually ship a catalog — the base
	 * locale has none by design (the English source *is* the key), so every
	 * lookup there is an expected "miss".
	 */
	missingKeys?: MissingKeysPolicy;
}

/**
 * Build a translator bound to `locale`. The English source is the key, so the
 * base/source locale needs no catalog — a missing lookup returns the key. Pass
 * a scope or raw `{ fr, nl, … }` catalogs as the source; `runtimeMessages`
 * overrides them (e.g. request-scoped data). `options.missingKeys` enforces a
 * {@link MissingKeysPolicy} for locales that ship a catalog.
 */
export function createT<const TSource extends MessageSource | undefined>(
	locale: string,
	messagesOrScope?: TSource,
	runtimeMessages?: MessageSource,
	options?: CreateTOptions,
): Translator<TSource> {
	const resolvedMessages =
		resolveMessages(runtimeMessages) ?? resolveMessages(messagesOrScope);
	const missingKeys = options?.missingKeys ?? "ignore";

	// The brand is erased at runtime; this function is the sole mint site.
	const translate = (
		english: string,
		values?: Record<string, unknown>,
	): LocalizedString => {
		const translated = resolvedMessages?.[locale]?.[english];
		if (translated === undefined && missingKeys !== "ignore") {
			reportMissingKey(english, locale, missingKeys);
		}
		const text = translated ?? english;
		if (!values) return text as LocalizedString;
		return format(text, locale, values) as LocalizedString;
	};

	return translate as Translator<TSource>;
}
