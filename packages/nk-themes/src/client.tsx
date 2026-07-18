"use client";

import { useTheme } from "@wrksz/themes/client";
import type { ComponentPropsWithoutRef } from "react";

// Re-export the vendor hook so client components import from nk-themes, never
// @wrksz/themes directly. Same shape as next-themes: { theme, resolvedTheme,
// setTheme, systemTheme, forcedTheme, themes }.
export { useTheme };
export type { ThemeContextValue } from "@wrksz/themes/client";

type ThemeToggleProps = Omit<
	ComponentPropsWithoutRef<"button">,
	"onClick" | "children"
> & {
	/** Accessible label for the button. Defaults to `"Toggle theme"`. */
	label?: string;
};

/**
 * A minimal light/dark toggle button. Clicking flips between `"light"` and
 * `"dark"` (resolving `"system"` first, so the first click always visibly
 * switches). The sun/moon swap is driven by the `.dark` class via Tailwind
 * `dark:` variants rather than React state, so there is no hydration flash and
 * no `mounted` guard needed.
 *
 * Headless-ish: it ships no icon dependency (inline SVGs) and no opinionated
 * styling beyond what you pass. Style it with `className` and the design-system
 * tokens the site already has:
 *
 * ```tsx
 * <ThemeToggle className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" />
 * ```
 *
 * For a three-way light/dark/system control, build your own with `useTheme` and
 * `THEME_MODES` — that UI varies too much between sites to standardize here.
 */
export function ThemeToggle({ label = "Toggle theme", ...props }: ThemeToggleProps) {
	const { resolvedTheme, setTheme } = useTheme();

	return (
		<button
			type="button"
			aria-label={label}
			onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
			{...props}
		>
			<SunIcon className="hidden dark:block" />
			<MoonIcon className="block dark:hidden" />
		</button>
	);
}

const ICON_PROPS = {
	width: 20,
	height: 20,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round",
	strokeLinejoin: "round",
	"aria-hidden": true,
} as const;

function SunIcon({ className }: { className?: string }) {
	return (
		<svg {...ICON_PROPS} className={className}>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
		</svg>
	);
}

function MoonIcon({ className }: { className?: string }) {
	return (
		<svg {...ICON_PROPS} className={className}>
			<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
		</svg>
	);
}
