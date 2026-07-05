/**
 * The one post-date formatter (one site shipped two of these). Defaults to the
 * long-form English style every site currently renders: "April 30, 2026".
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
	return new Intl.DateTimeFormat(locale, options).format(new Date(isoDate));
}
