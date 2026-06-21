"use client";

import { createContext, type ReactNode, useContext, useMemo, useRef } from "react";
import { createT, type I18nScope, type Messages, type Translator } from "./core.js";

const LocaleContext = createContext<string>("en");

/**
 * Provide the active locale to client components. Wrap the app once (in the root
 * layout) with the server-resolved locale.
 */
export function LocaleProvider({
	value,
	children,
}: {
	value: string;
	children: ReactNode;
}) {
	return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * Read the active locale. Pass the site's `Locale` union as the type argument
 * to get it back narrowed: `const locale = useLocale<Locale>()`.
 */
export function useLocale<TLocale extends string = string>(): TLocale {
	return useContext(LocaleContext) as TLocale;
}

/**
 * Client translator bound to the active locale from {@link LocaleProvider}.
 * Message sources are usually passed as fresh object literals each render
 * (`useT({ fr, nl })`), so they are held in a ref and the translator identity
 * only changes when the locale changes — safe to list in hook deps.
 */
export function useT<const TSource extends Messages | I18nScope | undefined>(
	messagesOrScope?: TSource,
	runtimeMessages?: Messages | I18nScope,
): Translator<TSource> {
	const locale = useContext(LocaleContext);
	const sources = useRef({ messagesOrScope, runtimeMessages });
	sources.current = { messagesOrScope, runtimeMessages };
	return useMemo(
		() =>
			createT(
				locale,
				sources.current.messagesOrScope,
				sources.current.runtimeMessages,
			),
		[locale],
	);
}
