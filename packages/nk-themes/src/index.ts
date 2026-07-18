// Package root: pure, server-safe exports only — no React, no next/headers — so
// server code and middleware can import the mode contract cheaply. The React
// surface lives at "@ingram-tech/nk-themes/client"; the Next provider at
// "@ingram-tech/nk-themes/next".
export { isThemeMode, THEME_MODES } from "./modes.js";
export type { ResolvedThemeMode, ThemeMode } from "./modes.js";

// Re-export the vendor's shared types so consumers type against nk-themes, never
// @wrksz/themes directly (the whole point of owning the dependency here).
export type { ThemeContextValue, ThemeProviderProps } from "@wrksz/themes/client";
