# nextkit philosophy

This document is the "why" behind nextkit. If you read only one doc, read this
one. It is written for both humans and AI agents working on Ingram
Technologies' websites — keep it current, because everything else flows from it.

## What nextkit is

nextkit is a **super-thin, opinionated foundation** shared by every Ingram
Next.js website. It is a set of independently versioned npm packages plus the
conventions, configuration, and documentation that make our sites consistent
and maintainable.

## The prime directive: stay indistinguishable from plain Next.js

> A nextkit site must be indistinguishable from a normal Next.js site, beyond
> its dependencies.

We are **not** building a meta-framework. There is no custom router and no
wrapper around the Next.js build. You can always run `next dev` and `next build`
directly, exactly as in any Next.js app. nextkit only provides:

- **Configuration** you extend (`.oxlintrc.json`, `.oxfmtrc.json`, `tsconfig.json`, Vitest preset).
- **Libraries** you import (`@ingram-tech/email`, …).
- **Conventions** documented here for humans and agents to follow.
- **An optional CLI** (`@ingram-tech/nk-cli`, the `nk` command) that *orchestrates*
  the standard commands — see the carve-out below.

If a feature would require us to intercept the Next.js build or hide Next.js
behind an abstraction, it does not belong in nextkit. This constraint is what
keeps us able to adopt new Next.js versions immediately and keeps every site
debuggable by anyone who knows Next.js.

### The `nk` carve-out: orchestration, never interception

`nk` is the one piece of nextkit that looks like a CLI, so it gets an explicit
boundary to keep it honest:

- **It only shells out to the standard tools** (`next`, `oxlint`, `oxfmt`,
  `tsc`, `supabase`) resolved from the site's own `node_modules`. It never replaces,
  patches, or hides them — `nk build` is `next build`, `nk dev` boots local
  Supabase (if present) and then runs `next dev`.
- **It is never required.** Every nextkit site must remain fully buildable and
  runnable with plain `next build` / `next dev` if `nk` is removed. `nk` is
  convenience (one place for the local-Supabase wiring and SQL formatting oxfmt
  can't do), not a dependency the build hides behind.
- **It carries no app logic.** If a command in `nk` ever did more than
  orchestrate standard tools, it would violate the prime directive and belong
  somewhere else.

This boundary is enforced, not just stated: see the orchestration tests in
`packages/nk-cli`.

## Single source of truth, propagated

Each shared concern lives in **one** package. Sites consume it by version. When
we improve it once, the improvement reaches every site through a normal
dependency bump (automated via Renovate). No copy-paste, no drift.

This is the problem nextkit exists to solve: we kept re-implementing the same
email client, the same lint rules, the same test setup on every site, and they
all drifted. Now they don't.

## Topology: independent repos, shared packages

Each website stays its **own repository**, owned and maintained by Ingram
indefinitely, and installs nextkit packages from npm. We chose this over a
single giant monorepo so that sites can diverge freely and deploy independently
on Vercel, while still sharing a common spine.

- Propagation of **additive** changes is cheap: Renovate opens a PR per repo,
  each gets its own Vercel preview, you merge.
- **Breaking** changes are expensive (N repos need edits). So: practice
  ruthless backward-compatibility, and ship a codemod alongside any unavoidable
  major bump.

## Packages are vertical slices

A nextkit package owns **everything it needs**, not just code:

1. Its **runtime code** (the client/functions it exports).
2. Its **environment contract** — a `keys.ts` that declares and validates the
   env vars it needs. Adding a package never means editing a central config
   file; the package brings its own env requirements. (Pattern borrowed from
   next-forge's composable env.)
3. Its **database migration**, if it is stateful (see below).
4. Its **documentation**, here in `docs/`, written for agents.

Install the slice → you get its code, its env validation, its schema, and the
instructions for using it, together.

## The Django-app model for stateful packages

Some packages (e.g. a future `@ingram-tech/newsletter`) need a database. We
treat these like Django apps:

- The package **owns its tables and ships its own migration**. "Installing" it
  means adding the package and applying its migration.
- It takes the database client by **injection** (`createNewsletter(supabase)`),
  defines its **own** row types, and never reaches into the consumer's generated
  Supabase types. This keeps it portable.
- Sites that don't need it simply don't install it — like leaving an app out of
  `INSTALLED_APPS`. We accept that some sites carry unused dependencies; that is
  cheaper than a formal inter-package dependency system at our scale.
- Cross-cutting features (e.g. linking newsletter subscriptions to auth users)
  are **opt-in** add-ons, not baked into the base package.

For now, stateful packages may hard-depend on Supabase. Not every site needs a
database; those that do use Supabase.

## The vendor stance: EU-first, self-hostable, no per-seat US SaaS

Defaults are chosen to keep us in control and in the EU where practical:

- **Email out & newsletter out:** Cloudflare Email Sending (zero-dep client).
- **Database (when needed):** Supabase.
- **Hosting/compute:** Vercel.
- **Lint/format:** oxc (oxlint + oxfmt). **Tests:** Vitest + Playwright.

We deliberately avoid the next-forge default stack of US paid SaaS (Clerk,
Prisma+Neon, Resend, etc.). We borrow next-forge's *package boundaries* as a
reference architecture, not its vendors.

## Two distribution channels

nextkit ships through two channels, both versioned, both propagated the same way:

1. **Runtime packages** (`@ingram-tech/*` on npm) — the code sites import.
   _This repo._
2. **Agent knowledge** — the skills, conventions, and enforcement that guide the
   coding agents (Claude Code et al.) that write most of our code. Today this
   lives as the `docs/` in each repo and the shared rules in
   [`code-style.md`](./code-style.md); it may graduate into a Claude Code plugin.

Channel 2 exists because, when agents write the code, the highest-leverage
shared asset is not the library — it is the **accumulated judgment**. See
[`ai-docs-convention.md`](./ai-docs-convention.md).

## Enforce what you can; document what you can't

Push every rule as far down this ladder as it will go:

1. **oxlint rule** (machine-enforced, can't be ignored) — best.
2. **Git hook / CI gate** (enforced at commit/PR time).
3. **Documentation** (relies on human/agent judgment) — last resort.

A rule that only lives in prose is a rule that gets forgotten 80k tokens into an
agent session. Convert aspirations into invariants wherever possible.

## The positive feedback loop

Every site improves the foundation; the improved foundation lifts every site.
When you discover a better pattern, a sharper lint rule, or a reusable helper
while working on one site, **promote it into nextkit** so the next site — and
the next agent — starts from it. That loop is the entire point. Keep it turning,
and keep this document honest.
