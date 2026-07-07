# CLAUDE.md

Guidance for Claude Code and other agents working in **nextkit**.

## What this repo is

nextkit is the shared foundation for Ingram Technologies' Next.js sites: a Bun
workspace of independently versioned `@ingram-tech/*` packages plus the
conventions that keep our fleet consistent. **Read [`docs/philosophy.md`](./docs/philosophy.md)
before making structural decisions** — it is the source of truth for the "why".

## Prime directive

nextkit must stay a **thin wrapper**: a consuming site is indistinguishable from
a plain Next.js app beyond its dependencies. Never add anything that wraps or
intercepts the Next.js build. We ship config to extend, libraries to import, and
docs to follow. The one CLI we ship — `nk`, in `@ingram-tech/nk-dev` — only
*orchestrates* the standard tools and must never be required: every site stays
fully buildable with plain `next build` / `next dev`. See the `nk` carve-out in
[`docs/philosophy.md`](./docs/philosophy.md).

## Commands

```bash
bun install
bun run ci          # check + build + type-check + test (run before pushing)
bun run build       # build publishable packages (tsc)
bun run check       # oxlint + oxfmt --check
bun run changeset   # required for any change to a published package
```

## Conventions (the short version — full rules in docs/)

- **Code style:** [`docs/code-style.md`](./docs/code-style.md). Tabs/4/88 via
  oxfmt. No `as` casts on external input (use Zod), no non-null `!`, no
  `oxlint-disable` without justification.
- **Packages are vertical slices:** each owns its code, its `keys.ts` env
  contract, its migration (if stateful), and its docs. See
  [`docs/creating-a-package.md`](./docs/creating-a-package.md).
- **Enforce > document:** prefer an oxlint rule or local oxlint plugin over a prose rule.
- **peerDependencies for `next`/`react`**, never `dependencies`.
- **Transactional email:** render from the registry, send via `nk-email`;
  from-address, dev-fallback, and import conventions in
  [`docs/transactional-email.md`](./docs/transactional-email.md).
- **Changeset every published change.** Keep changes backward-compatible; ship a
  codemod with any breaking major.

## The docs/ convention

This repo follows the "docs written by and for AI" pattern
([`docs/ai-docs-convention.md`](./docs/ai-docs-convention.md)) that we replicate
in every Ingram repo. Keep this CLAUDE.md thin; put subsystem knowledge in
`docs/`.
