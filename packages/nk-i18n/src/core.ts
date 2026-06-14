import IntlMessageFormat from "intl-messageformat";

type MessageCatalog = Record<string, string>;
declare const I18N_KEY_BRAND: unique symbol;

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
 */
export type Translator<TSource extends MessageSource | undefined = undefined> = <
	const TValue extends string,
>(
	english: AllowedMessageKey<TSource, TValue>,
	values?: Record<string, unknown>,
) => string;

const cache = new Map<string, IntlMessageFormat>();

function format(
	message: string,
	locale: string,
	values: Record<string, unknown>,
): string {
	const key = `${locale}:${message}`;
	let fmt = cache.get(key);
	if (!fmt) {
		fmt = new IntlMessageFormat(message, locale);
		cache.set(key, fmt);
	}
	return fmt.format(values) as string;
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

/**
 * Build a translator bound to `locale`. The English source is the key, so the
 * base/source locale needs no catalog — a missing lookup returns the key. Pass
 * a scope or raw `{ fr, nl, … }` catalogs as the source; `runtimeMessages`
 * overrides them (e.g. request-scoped data).
 */
export function createT<const TSource extends MessageSource | undefined>(
	locale: string,
	messagesOrScope?: TSource,
	runtimeMessages?: MessageSource,
): Translator<TSource> {
	const resolvedMessages =
		resolveMessages(runtimeMessages) ?? resolveMessages(messagesOrScope);

	const translate = (english: string, values?: Record<string, unknown>): string => {
		const translated = resolvedMessages?.[locale]?.[english] ?? english;
		if (!values) return translated;
		return format(translated, locale, values);
	};

	return translate as Translator<TSource>;
}
