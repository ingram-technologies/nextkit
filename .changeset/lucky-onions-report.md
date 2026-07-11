---
"@ingram-tech/nk-dev": minor
---

New oxlint rule `nextkit/no-deferred-current-target` (error, fleet-wide): bans reading `event.currentTarget` inside a callback nested in the event handler. React nulls `currentTarget` once the handler returns, so a read inside a setState updater, setTimeout, or promise chain crashes intermittently at runtime, and tsc cannot catch it (the typings declare it non-null). Fix pattern: capture the needed value into a local in the handler body and close over that. The `@ingram-tech/nk-dev/oxlint-plugin` export now resolves to an index merging all nextkit rules.
