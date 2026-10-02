---
"@ingram-tech/nk-themes": minor
---

@wrksz/themes 2. `ThemeProvider` is now synchronous and no longer reads the
theme cookie on the server, so the root layout stops forcing request-time
rendering on every page. There is still zero flash: the pre-paint script reads
the cookie. `useTheme` returns `undefined` until hydration. A site whose
server-rendered markup must know the mode now calls `getTheme()` and passes
`<ThemeProvider initialTheme={mode}>`. `forcedTheme` no longer persists to the
cookie, and changing `initialTheme`/`storageKey` after mount no longer
re-initializes. Requires TypeScript 5.9+.
