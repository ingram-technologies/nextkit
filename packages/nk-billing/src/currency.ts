/**
 * Presentment currency. We sell in two — EUR (the home/base currency) and USD —
 * chosen by where the request comes from. A Stripe Price carries the EUR base
 * `unit_amount` plus a USD entry in `currency_options`; checkout passes the
 * resolved currency and Stripe charges the matching amount.
 *
 * Currency resolution reads Vercel's edge geolocation header
 * (`x-vercel-ip-country`). To stay framework-agnostic this module never imports
 * `next/headers`; the caller passes a `Headers` object (e.g. `await headers()` in
 * a Next.js Server Component, or `request.headers` in a route handler).
 */

/** The two presentment currencies we offer. */
export type BillingCurrency = "usd" | "eur";

/** Used when the caller's region is unknown — and the base on the Stripe prices. */
export const DEFAULT_CURRENCY: BillingCurrency = "eur";

/** EU/EEA country codes served in euros (closer to EUR than USD even where the
 *  local currency isn't the euro — we only offer the two). Everyone else: USD. */
export const EUR_COUNTRIES: ReadonlySet<string> = new Set([
	// Eurozone
	"AT",
	"BE",
	"HR",
	"CY",
	"EE",
	"FI",
	"FR",
	"DE",
	"GR",
	"IE",
	"IT",
	"LV",
	"LT",
	"LU",
	"MT",
	"NL",
	"PT",
	"SK",
	"SI",
	"ES",
	// Rest of EU (non-euro)
	"BG",
	"CZ",
	"DK",
	"HU",
	"PL",
	"RO",
	"SE",
	// EEA + microstates that use the euro
	"IS",
	"LI",
	"NO",
	"MC",
	"SM",
	"VA",
	"AD",
]);

/** Map an ISO-3166 alpha-2 country code to a presentment currency: EU/EEA → EUR,
 *  any other identified country → USD, and no signal (absent header / local dev)
 *  → the home base currency. */
export function currencyForCountry(
	country: string | null | undefined,
): BillingCurrency {
	if (!country) return DEFAULT_CURRENCY;
	return EUR_COUNTRIES.has(country.toUpperCase()) ? "eur" : "usd";
}

/** Resolve the caller's presentment currency from a `Headers` object via Vercel's
 *  `x-vercel-ip-country` (set at the edge on every request). Falls back to the
 *  base currency off-Vercel where the header is absent. */
export function resolveCurrencyFromHeaders(headers: Headers): BillingCurrency {
	return currencyForCountry(headers.get("x-vercel-ip-country"));
}

/** Format a Stripe minor-unit amount (cents) in `currency` for display. Drops the
 *  trailing ".00" on round figures. */
export function formatAmount(minorUnits: number, currency: BillingCurrency): string {
	return new Intl.NumberFormat(currency === "eur" ? "en-IE" : "en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
		minimumFractionDigits: minorUnits % 100 === 0 ? 0 : 2,
	}).format(minorUnits / 100);
}
