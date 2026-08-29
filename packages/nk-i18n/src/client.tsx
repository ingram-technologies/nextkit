"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import {
	type CreateTOptions,
	createT,
	type I18nScope,
	type Messages,
	type Translator,
} from "./core.js";

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
 * (`useT({ fr, nl })`), so they are deliberately not deps: the translator
 * identity only changes when the locale changes — safe to list in hook deps.
 * When it does, the memo runs this render's closure, so it picks up the
 * current sources without any ref.
 */
export function useT<const TSource extends Messages | I18nScope | undefined>(
	messagesOrScope?: TSource,
	runtimeMessages?: Messages | I18nScope,
	options?: CreateTOptions,
): Translator<TSource> {
	const locale = useContext(LocaleContext);
	return useMemo(
		() => createT(locale, messagesOrScope, runtimeMessages, options),
		// oxlint-disable-next-line react/exhaustive-deps -- sources are fresh literals each render; the translator is bound per locale by design
		[locale],
	);
}
