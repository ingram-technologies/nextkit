/**
 * The three color modes every nextkit site exposes. `"system"` follows the
 * OS `prefers-color-scheme`; `"light"`/`"dark"` are explicit user choices.
 *
 * Pure and dependency-free so it can be imported from server code, middleware,
 * or a settings form without pulling in React.
 */
export const THEME_MODES = ["light", "dark", "system"] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

/** The resolved modes — what `"system"` collapses to once a preference is known. */
export type ResolvedThemeMode = Exclude<ThemeMode, "system">;

/** Narrow an arbitrary string (e.g. a cookie value) to a valid mode. */
export function isThemeMode(value: string | undefined): value is ThemeMode {
	return value === "light" || value === "dark" || value === "system";
}
