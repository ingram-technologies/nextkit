---
"@ingram-tech/nk-i18n": minor
---

`LocaleProvider` is gone; `@ingram-tech/nk-i18n/client` exports `LocaleContext` instead. Render it as the provider, `<LocaleContext value={locale}>`, in a client or (React 19.3) server component. The React peer is now `^19.0.0`, which `<Context value>` needs.
