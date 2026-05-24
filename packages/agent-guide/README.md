# @ingram-tech/agent-guide

A deliberately **brief** statement of nextkit conventions, written for AI coding
agents. The point: agent guidance should propagate like the code does — live
once here, flow to every site on a version bump — instead of being hand-copied
into each repo's `CLAUDE.md` (which drifts).

## How it works

A consuming site's `CLAUDE.md` holds a single, stable line that imports this
package's guide:

```md
@./node_modules/@ingram-tech/agent-guide/guide.md
```

That line is added **once** (by nextkit adoption) and never edited. When this
package is bumped (via Renovate), the guidance the agent sees updates
automatically — no per-site maintenance.

## What goes in `guide.md`

Only the necessities: the core philosophy, the few hard rules, and a one-line
summary of each `@ingram-tech/*` feature so the agent knows what exists and
reaches for it. Detail stays in each package's own README (read on demand). Keep
it short — it loads into every session.

When nextkit gains a feature, add a line to `guide.md` and bump; every site
picks it up on its next dependency update.
