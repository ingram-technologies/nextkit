---
"@ingram-tech/nk-cli": minor
---

`nk check` now gates the agent-guide import: if a site depends on
`@ingram-tech/agent-guide` but its CLAUDE.md doesn't `@import` the guide, the
check fails with a fix-it message. Stops sites from quietly dropping off the
shared-guidance channel (the guide can't help an agent it never loads). Looks for
CLAUDE.md beside package.json or one level up (for apps nested in a subdir).
