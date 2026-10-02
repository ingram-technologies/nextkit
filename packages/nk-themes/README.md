# @ingram-tech/nk-themes

Color-mode theming (light / dark / system) for Next.js apps. A thin wrapper over
[`@wrksz/themes`](https://www.npmjs.com/package/@wrksz/themes) that pins the
dependency and ships preconfigured defaults, so an app never wires theming, or
patches the vendor, itself.

## Why this exists

`@wrksz/themes` keeps the familiar `next-themes` API but stores the mode in a
**cookie**. The provider injects a small pre-paint script that reads it and sets
the mode class before the first paint, so there is zero flash, and it never
calls `cookies()` itself, so the root layout stays static (no request-time
rendering forced on every page). It also avoids the React 19
`dangerouslySetInnerHTML` warning that forces a patch to `next-themes`.

Wrapping it here keeps the vendor an implementation detail: you import
`@ingram-tech/nk-themes/*`, and an override, patch or replacement happens in one
place. The defaults it sets are cookie storage, the `.dark` class for Tailwind,
system following, and no transition flash.

## Setup

Mount the provider in the root `app/layout.tsx`, wrapping the app. The
`<html>` needs `suppressHydrationWarning` because the mode class is set before
React hydrates.

```tsx
import { ThemeProvider } from "@ingram-tech/nk-themes/next";

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body>
				<ThemeProvider>{children}</ThemeProvider>
			</body>
		</html>
	);
}
```

Every default is overridable by passing any `@wrksz/themes` prop, e.g. a
`storageKey` to preserve a legacy cookie name:

```tsx
<ThemeProvider storageKey="mysite.mode">{children}</ThemeProvider>
```

## Reading and changing the mode

Client components use `useTheme` — the same shape as `next-themes`:

```tsx
"use client";
import { useTheme } from "@ingram-tech/nk-themes/client";

function Example() {
	const { resolvedTheme, setTheme } = useTheme();
	return <button onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} />;
}
```

Or drop in the ready-made toggle. It ships no icon dependency and no styling
beyond what you pass; the sun/moon swap is CSS-driven (`dark:` variants), so
there is no hydration flash:

```tsx
import { ThemeToggle } from "@ingram-tech/nk-themes/client";

<ThemeToggle className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" />;
```

For a three-way light/dark/system control (a settings dropdown, a radio group),
build it from `useTheme` and the `THEME_MODES` constant; that UI varies too much
between apps to standardize:

```tsx
import { THEME_MODES } from "@ingram-tech/nk-themes";
import { useTheme } from "@ingram-tech/nk-themes/client";

const { theme, setTheme } = useTheme();
// render your own <select>/<RadioGroup> over THEME_MODES, calling setTheme(mode)
```

## Reading the mode on the server

The provider does not read the cookie on the server, so `useTheme` returns
`undefined` until hydration; keep theme-dependent UI equal on server and client
(the CSS-driven `ThemeToggle` already is). When server-rendered markup itself
must know the mode, read it with `getTheme` — in a Server Component (async, via
`next/headers`) or in middleware/proxy (synchronous, from a `Request`) — and
seed the provider with `initialTheme`:

```tsx
import { getTheme, ThemeProvider } from "@ingram-tech/nk-themes/next";

const mode = await getTheme({ defaultTheme: "system" }); // "light" | "dark" | "system"
<ThemeProvider initialTheme={mode}>{children}</ThemeProvider>;
```

That read makes the layout render per request; only do it where the markup
genuinely differs by mode.

## Entry points

| Import | Contains | Runtime |
| --- | --- | --- |
| `@ingram-tech/nk-themes` | `THEME_MODES`, `ThemeMode`/`ResolvedThemeMode`, `isThemeMode`, shared types | server-safe, no React |
| `@ingram-tech/nk-themes/next` | `ThemeProvider` (preconfigured defaults), `getTheme` | Next server |
| `@ingram-tech/nk-themes/client` | `useTheme`, `ThemeToggle` | client |

## Scope

This package owns **color mode only**. Multi-palette / brand-preset theming
(e.g. a `data-theme` attribute selecting among several palettes) varies far more
between apps; keep it local to the app that needs it.
