// Server-safe entry — no React. Client hooks live at "@ingram-tech/nk-i18n/client".
export {
	createT,
	type CreateTOptions,
	defineI18nScope,
	defineMessages,
	type I18nScope,
	type LocalizedString,
	type Messages,
	type MessageSource,
	type TranslationKey,
	type Translator,
} from "./core.js";
export {
	defineI18nConfig,
	deriveLocaleConstants,
	type I18nConfig,
	localeMap,
	type LocaleDefinition,
	type MissingKeysPolicy,
} from "./config.js";
export { negotiateAcceptLanguage } from "./negotiate.js";
export {
	defineLocaleRouting,
	LOCALE_PRECEDENCE,
	type LocaleRouting,
	type LocaleRoutingConfig,
	type LocaleSignal,
	type LocaleSignals,
	type LocaleStrategy,
	type LocaleSupplier,
	type LocaleSuppliers,
	resolveLocaleFromSignals,
	resolveLocaleFromSuppliers,
} from "./routing.js";
