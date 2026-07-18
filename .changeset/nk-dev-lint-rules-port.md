---
"@ingram-tech/nk-dev": minor
---

Add three custom oxlint rules to the shared `nextkit` plugin, ported from the
Ingram ESLint recommended set and adapted for oxlint (all `warn`):

- `nextkit/no-redundant-usestate-type` — strips `useState<T>` type arguments
  that TypeScript already infers from the initial value (autofix). Narrower than
  the upstream rule: it skips `null` initial values (a runtime change, not a
  redundancy) and array annotations (`useState<string[]>([])` is load-bearing —
  `useState([])` infers `never[]`), both of which the upstream autofix silently
  broke.
- `nextkit/lucide-icon-suffix` — enforces the `Icon` suffix on `lucide-react`
  imports and rewrites references (autofix), matching lucide's own deprecation
  of the bare aliases. Inert on sites that don't import lucide; skips the
  package's non-icon exports.
- `nextkit/no-redirect-only-page` — suggests a `next.config` redirect for an App
  Router `page.tsx` whose only job is to call `redirect(...)`, with the config
  entry inlined in one diagnostic. Now validates every page shape (including
  `export default function`), closing a false-positive the upstream rule had on
  function-declaration pages.

The Supabase rules and the opinionated `nextjs-page-pattern` rule from the
upstream set were intentionally not ported.
