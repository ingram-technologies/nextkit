import { getTheme, ThemeProvider as WrkszThemeProvider } from "@wrksz/themes/next";
import type { ThemeProviderProps } from "@wrksz/themes/next";

/**
 * The house color-mode provider. Mount it in the root `app/layout.tsx`, wrapping
 * the app, on an `<html suppressHydrationWarning>`:
 *
 * ```tsx
 * import { ThemeProvider } from "@ingram-tech/nk-themes/next";
 *
 * export default function RootLayout({ children }: { children: React.ReactNode }) {
 *   return (
 *     <html lang="en" suppressHydrationWarning>
 *       <body>
 *         <ThemeProvider>{children}</ThemeProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 *
 * It bakes in the defaults every nextkit site wants:
 *
 * - `storage="cookie"` — the injected pre-paint script reads the cookie and sets
 *   the mode before first paint, so there is **zero flash**. The provider never
 *   calls `cookies()`, so the layout stays static; pass `initialTheme` from
 *   {@link getTheme} only where server markup must know the mode.
 * - `attribute="class"` — toggles the `.dark` class on `<html>`, matching the
 *   Tailwind `dark:` variant our design system uses.
 * - `enableSystem` + `defaultTheme="system"` — follow the OS until the user picks.
 * - `disableTransitionOnChange` — no cross-fade flash when the mode flips.
 *
 * Every default is overridable: pass any {@link ThemeProviderProps} (e.g. a
 * `storageKey` to preserve a legacy cookie name, or a `nonce` for CSP).
 */
export function ThemeProvider(props: ThemeProviderProps) {
	return (
		<WrkszThemeProvider
			storage="cookie"
			attribute="class"
			enableSystem
			defaultTheme="system"
			disableTransitionOnChange
			{...props}
		/>
	);
}

/**
 * Read the current color mode from the theme cookie, server-side. Pass a
 * `Request` for synchronous use in middleware/proxy, or call with no args in a
 * Server Component (reads via `next/headers`, which makes it render per
 * request). Feed the result to `ThemeProvider`'s `initialTheme`. Re-exported from `@wrksz/themes`
 * so sites depend only on nk-themes.
 */
export { getTheme };
export type { ThemeProviderProps };
