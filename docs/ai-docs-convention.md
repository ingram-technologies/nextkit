# The `docs/` convention: docs written by and for AI

Every Ingram repo carries a `docs/` directory of **developer-facing technical
documentation, written by and for AI agents** (and the humans working alongside
them). This is a deliberate, systematic pattern, and it is part of nextkit
itself.

## Why

We build with coding agents. When agents write most of the code, the scarcest
shared resource is not the code — it is the **accumulated judgment**: why a
subsystem is shaped the way it is, which helper is canonical, what the gotchas
are. Left in chat logs or a single person's head, that knowledge evaporates. In `docs/`, it compounds: every agent session starts better-informed than the
last.

This is "Channel 2" from [`philosophy.md`](./philosophy.md#two-distribution-channels)
— the agent-knowledge layer.

## What goes here

- **Subsystem walkthroughs**: how a non-trivial flow works, with the entry-point
  file path and the high-level steps (e.g. `invoice-payment-application.md`).
- **Architecture decisions**: where new code should live, which patterns to
  phase out (e.g. `architecture-decisions.md`).
- **Integration notes**: the quirks of an external API or format.
- **Design principles**: the target architecture for an evolving area.

Not here: user-facing product docs (those live elsewhere, e.g.
`src/content/docs/`), and API reference (that's the code + types).

## How to write it

- **Audience is an agent picking up the task cold.** Be precise and
  operational. Lead with the entry point: name the file
  (`src/lib/invoices/apply-transaction-payment.ts`), then the flow.
- **Show patterns with short code examples**, not prose alone.
- **State decisions and their reasoning** — a lightweight ADR. Say what to do
  *and what to stop doing*.
- **Link to source files** by path so the reader can jump in.
- **Flat and topic-named.** One file per subsystem, named for the topic
  (`logging.md`, `audit-logging.md`). No deep hierarchy.
- **Keep it honest.** A stale doc is worse than none. Update it when the code
  changes — ideally in the same PR.

## Relationship to CLAUDE.md

`CLAUDE.md` is loaded into **every** agent session, so it costs tokens always —
keep it thin: project facts + always-true invariants + pointers into `docs/`.
The bulk of the knowledge lives in `docs/`, read on demand when relevant. Don't
let task-specific instructions bloat `CLAUDE.md`; if it reads like "how to do
task X," it's probably a `docs/` entry (or, eventually, a skill).
