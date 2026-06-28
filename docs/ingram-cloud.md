# Ingram Cloud (planned)

> Status: **planned / placeholder.** This document marks the intended direction
> so it isn't lost. Nothing here is built yet.

Ingram Cloud is the planned backend that will sit behind nextkit, providing
**observability-ready AI frameworks** as a managed service for our sites. Where
nextkit gives a site its client-side and edge foundation, Ingram Cloud will give
it a shared, instrumented backend for AI features.

## Intent

- **Observability-first AI**: AI/agent frameworks that emit traces, token/cost
  accounting, and evaluation hooks out of the box — so every site's AI features
  are debuggable and measurable without per-site plumbing.
- **Consumed the nextkit way**: as one or more `@ingram-tech/*` packages with
  their own `keys.ts` env contracts, opt-in per site, following the same
  vertical-slice and Django-app conventions as every other package.
- **EU-first and self-hostable**, consistent with the
  [vendor stance](./philosophy.md#the-vendor-stance-eu-first-self-hostable-no-per-seat-us-saas).

## Open questions (to resolve before building)

- Transport: SDK package vs. hosted API vs. both.
- Where state lives (the shared Postgres vs. a dedicated store) and how it injects.
- Relationship to the AI Gateway / model-routing layer.

When this graduates from placeholder to real, replace this file with a proper
subsystem walkthrough per [`ai-docs-convention.md`](./ai-docs-convention.md).
