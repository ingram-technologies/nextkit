# @ingram-tech/nk-themes

## 0.2.0

### Minor Changes

- 53e92af: New package: color-mode theming (light / dark / system) for nextkit sites, a thin
  wrapper over `@wrksz/themes` that pins the dependency once and ships the house
  defaults so sites never wire theming — or patch the vendor — themselves.

  - `@ingram-tech/nk-themes/next` — a `<ThemeProvider>` with cookie storage
    (zero-flash SSR, no injected inline script), `.dark`-class attribute for
    Tailwind, system-following, and no transition flash; every default overridable.
    Plus `getTheme` for server/middleware reads.
  - `@ingram-tech/nk-themes/client` — `useTheme` (same shape as `next-themes`)
    re-exported, and a headless, icon-dependency-free `<ThemeToggle>`.
  - `@ingram-tech/nk-themes` — server-safe `THEME_MODES` / `ThemeMode` /
    `isThemeMode` and shared types, for building a light/dark/system control.

  Owning the vendor here means one version pin and a single place to override,
  patch, or replace it — sites depend on `@ingram-tech/nk-themes`, never on
  `@wrksz/themes` directly.
