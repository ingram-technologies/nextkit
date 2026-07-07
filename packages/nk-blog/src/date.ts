/**
 * The one post-date formatter (one site shipped two of these). Defaults to the
 * long-form English style every site currently renders: "April 30, 2026".
 *
 * Formats in UTC by default: post dates are normalized to UTC midnight, so a
 * local-zone format would render the previous day anywhere west of UTC (and
 * hydration-mismatch per viewer when used client-side). Pass `timeZone` in
 * `options` to override.
 */
export function formatPostDate(
	isoDate: string,
	locale = "en",
	options: Intl.DateTimeFormatOptions = {
		year: "numeric",
		month: "long",
		day: "numeric",
	},
): string {
	return new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(
		new Date(isoDate),
	);
}
